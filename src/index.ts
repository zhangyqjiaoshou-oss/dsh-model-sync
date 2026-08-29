/**
 * dsh-model-sync — DeepSeek Harness provider model sync.
 *
 * Host half: keeps the `llm-pi-ai` provider model lists aligned with each
 * provider's `/v1/models` endpoint.
 *
 * Two triggers share one reconcile core:
 *   - manual: the settings page button calls the client half, which drives
 *     the official `llm.discoverModels` / `settings.mutate` RPCs itself
 *     (see src/client/index.ts).
 *   - automatic: whenever a conversation page opens (agent/session-start),
 *     this half re-discovers and rewrites the provider lists, honoring the
 *     auto-sync switch persisted in its own `model-sync` settings namespace.
 *
 * The stored list is REPLACED, not merged: models the endpoint no longer
 * advertises are removed. Other provider fields (apiKeyEnv, baseURL, api,
 * displayName) are preserved.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** A conversation session page opened (the Host-side session lifecycle began). */
    'agent/session-start'(): void
  }
}

/** The namespace this plugin owns: the auto-sync switch. */
const OWN_NS = settingsNamespace('model-sync')
/** The namespace this plugin reconciles: pi-ai provider profiles. */
const TARGET_NS = settingsNamespace('llm-pi-ai')

interface SyncConfig {
  /** Sync provider model lists whenever a conversation page opens. */
  autoSync: boolean
  /** Minimum milliseconds between two automatic syncs. */
  debounceMs: number
}

export const Config = z.object({
  autoSync: z.boolean().default(false),
  debounceMs: z.number().min(1000).default(10000),
})

type AppContext = Context & {
  llm: {
    discoverModels(ns: string, request: {
      provider?: string
      baseURL?: string
      api?: string
      signal?: AbortSignal
    }): Promise<Array<{ id: string; name?: string; contextWindow?: number; maxTokens?: number }>>
  }
  settings: Service & {
    get(ns: string): unknown
    update(ns: string, patch: object): Promise<void>
  }
}

function isSyncConfig(value: unknown): value is Partial<SyncConfig> {
  return typeof value === 'object' && value !== null
}

export function apply(ctx: AppContext, config: SyncConfig): void {
  // ── state ────────────────────────────────────────────────────────────────
  let autoSyncEnabled = !!config.autoSync
  let lastSyncAt = 0

  // ── reconcile core ────────────────────────────────────────────────────────
  async function reconcile(): Promise<{
    ok: boolean
    routes: Array<{
      route: string
      added: number
      removed: number
      total: number
      error?: string
    }>
    message?: string
  }> {
    const settings = ctx.settings
    if (settings === undefined) {
      return { ok: false, routes: [], message: 'settings service unavailable' }
    }

    const piAiCfg = settings.get(TARGET_NS) as
      | { providers?: Record<string, { displayName?: string; baseURL?: string; api?: string; models?: Array<{ id: string }> }> }
      | undefined
    const providers = piAiCfg?.providers ?? {}
    const routes = Object.keys(providers)

    if (routes.length === 0) {
      return { ok: true, routes: [], message: 'no providers configured' }
    }

    const patch: Record<string, unknown> = { providers: {} }
    const providersPatch = patch.providers as Record<string, unknown>
    const routeReports: Array<{
      route: string
      added: number
      removed: number
      total: number
      error?: string
    }> = []

    for (const route of routes) {
      const provider = providers[route]
      try {
        const request: {
          provider?: string
          baseURL?: string
          api?: string
        } = {}
        if (provider.baseURL) request.baseURL = provider.baseURL
        if (provider.api) request.api = provider.api

        const discovered = await ctx.llm.discoverModels(TARGET_NS, request)

        const existingIds = new Set((provider.models ?? []).map((m) => m.id))
        const discoveredIds = new Set(discovered.map((m) => m.id))
        let added = 0
        let removed = 0
        for (const id of discoveredIds) if (!existingIds.has(id)) added++
        for (const id of existingIds) if (!discoveredIds.has(id)) removed++

        // Replace the stored model list; keep every other provider field.
        const newProvider: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(provider)) {
          if (key !== 'models') newProvider[key] = value
        }
        newProvider.models = discovered.map((m) => ({
          id: m.id,
          ...(m.name !== undefined && m.name !== null ? { name: m.name } : {}),
          ...(m.contextWindow !== undefined && m.contextWindow !== null ? { contextWindow: m.contextWindow } : {}),
          ...(m.maxTokens !== undefined && m.maxTokens !== null ? { maxTokens: m.maxTokens } : {}),
        }))
        providersPatch[route] = newProvider

        routeReports.push({ route, added, removed, total: discovered.length })
      } catch (error) {
        // Keep the provider untouched when its endpoint fails.
        providersPatch[route] = provider
        routeReports.push({ route, added: 0, removed: 0, total: 0, error: error instanceof Error ? error.message : String(error) })
      }
    }

    try {
      await settings.update(TARGET_NS, patch)
    } catch (writeError) {
      return { ok: false, routes: routeReports, message: `write failed: ${writeError instanceof Error ? writeError.message : String(writeError)}` }
    }

    return { ok: true, routes: routeReports }
  }

  // ── debounced auto-sync entry ─────────────────────────────────────────────
  async function autoSync(): Promise<void> {
    const now = Date.now()
    if (now - lastSyncAt < config.debounceMs) return
    lastSyncAt = now
    try {
      await reconcile()
    } catch (error) {
      ctx.logger?.warn?.('[dsh-model-sync] auto sync failed:', error)
    }
  }

  // ── own settings namespace (the auto-sync switch) ────────────────────────
  // The settings seam hands us a thunk that resolves this namespace's current
  // value; onChange fires at attach, at detach, and on every user write.
  let current = (): unknown => config
  installSettingsSection(ctx, OWN_NS, Config, config, {
    setSource: (source) => {
      current = source
      autocatch(() => {
        const value = current()
        if (isSyncConfig(value) && typeof value.autoSync === 'boolean') autoSyncEnabled = value.autoSync
      })
    },
    onChange: () => {
      autocatch(() => {
        const value = current()
        if (isSyncConfig(value) && typeof value.autoSync === 'boolean') autoSyncEnabled = value.autoSync
      })
    },
  })

  // ── conversation-open trigger ─────────────────────────────────────────────
  ctx.on('agent/session-start', () => {
    if (!autoSyncEnabled) return
    void autoSync()
  })

  function autocatch(fn: () => void): void {
    try {
      fn()
    } catch (_) {
      /* settings seam may be mid-teardown */
    }
  }
}