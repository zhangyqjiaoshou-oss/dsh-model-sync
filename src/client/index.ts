/**
 * dsh-model-sync — browser half.
 *
 * Renders the Model Sync section in Settings. Manual sync drives the official
 * wire APIs directly (no custom Host RPC): read provider profiles from
 * `settings.describe`, interrogate each endpoint with `llm.discoverModels`,
 * and write the new model list back with `settings.mutate`.
 *
 * The auto-sync toggle is persisted two ways: localStorage for instant UI
 * restore, and the plugin's `model-sync` settings namespace so the Host half
 * (which reconciles on conversation open) honors it.
 */
import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'

/**
 * Structural slot contract (dsh-client-ui-slots is a runtime-injected client
 * module; its types are not present in the host node_modules tree, so the
 * subset this plugin touches is declared locally instead of imported).
 */
interface SlotsService {
  inject(key: string, callback: () => (() => void) | void, name?: string): void
  register(entry: {
    name: string
    id: string
    order?: number
    label?: () => string | undefined
    component: () => { render(): HTMLElement }
  }): unknown
}

type ClientContext = {
  slots: SlotsService
  connection: { api: IApiClient; isLoopback: boolean }
}

export const inject = ['slots', 'connection']

const OWN_NS = 'model-sync'
const TARGET_NS = 'llm-pi-ai'
const LS_KEY = 'dsh-model-sync-auto'

interface RouteReport {
  route: string
  added: number
  removed: number
  total: number
  error?: string
}

interface ProviderProfile {
  displayName?: string
  baseURL?: string
  api?: string
  models?: Array<{ id: string }>
}

export function apply(ctx: ClientContext): void {
  const api = ctx.connection.api

  // ── sync-all through the official wire APIs ───────────────────────────────
  async function syncAllModels(): Promise<{ ok: boolean; routes: RouteReport[]; message?: string }> {
    // 1. read the target namespace's user view to learn provider routes
    const describe = await api.settings.describe({})
    if (!describe.result.ok) {
      return { ok: false, routes: [], message: describe.result.error.message }
    }
    const view = describe.result.value.namespaces.find((row) => row.ns === TARGET_NS)
    const providers = (view?.value as { providers?: Record<string, ProviderProfile> } | undefined)?.providers ?? {}
    const routes = Object.keys(providers)

    if (routes.length === 0) {
      return { ok: true, routes: [], message: 'no providers configured' }
    }

    // 2. interrogate each endpoint, then 3. replace its stored model list.
    const reports: RouteReport[] = []
    const ops: Array<{ op: 'set'; path: string[]; value: unknown }> = []

    for (const route of routes) {
      const provider = providers[route] ?? {}
      const request: { settingsNs: string; provider?: string; baseURL?: string; api?: string } = { settingsNs: TARGET_NS }
      if (route) request.provider = route
      if (provider.baseURL) request.baseURL = provider.baseURL
      if (provider.api) request.api = provider.api
      try {
        const response = await api.llm.discoverModels(request)
        if (!response.result.ok) {
          reports.push({ route, added: 0, removed: 0, total: 0, error: response.result.error.message })
          continue
        }
        const found = response.result.value.models
        const existingIds = new Set((provider.models ?? []).map((m) => m.id))
        const foundIds = new Set(found.map((m) => m.id))
        let added = 0
        let removed = 0
        for (const id of foundIds) if (!existingIds.has(id)) added++
        for (const id of existingIds) if (!foundIds.has(id)) removed++
        const normalized = found.map((m) => ({
          id: m.id,
          ...(m.name !== undefined && m.name !== null ? { name: m.name } : {}),
          ...(m.contextWindow !== undefined && m.contextWindow !== null ? { contextWindow: m.contextWindow } : {}),
          ...(m.maxTokens !== undefined && m.maxTokens !== null ? { maxTokens: m.maxTokens } : {}),
        }))
        ops.push({ op: 'set', path: ['providers', route, 'models'], value: normalized })
        reports.push({ route, added, removed, total: found.length })
      } catch (error) {
        reports.push({ route, added: 0, removed: 0, total: 0, error: error instanceof Error ? error.message : String(error) })
      }
    }

    if (ops.length === 0) return { ok: true, routes: reports }

    const write = await api.settings.mutate({ ns: TARGET_NS, ops })
    if (!write.result.ok) {
      return { ok: false, routes: reports, message: `write failed: ${write.result.error.message}` }
    }
    return { ok: true, routes: reports }
  }

  // ── persist the auto-sync toggle for the Host half ────────────────────────
  async function persistAutoSync(enabled: boolean): Promise<void> {
    try {
      localStorage.setItem(LS_KEY, String(enabled))
    } catch (_) { /* storage unavailable */ }
    try {
      await api.settings.mutate({ ns: OWN_NS, ops: [{ op: 'set', path: ['autoSync'], value: enabled }] })
    } catch (_) { /* host half picks the switch up on the next session open */ }
  }

  function readLocalAutoSync(): boolean {
    try {
      return localStorage.getItem(LS_KEY) === 'true'
    } catch (_) {
      return false
    }
  }

  // ── settings section UI (DOM render, no framework dependency) ─────────────
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section',
      id: 'model-sync',
      order: 11,
      label: () => 'Model Sync',
      component: () => ({
        render(): HTMLElement {
          const root = document.createElement('div')
          root.style.maxWidth = '720px'
          root.style.display = 'flex'
          root.style.flexDirection = 'column'
          root.style.gap = '12px'
          root.style.padding = '4px 2px'

          const title = document.createElement('h2')
          title.textContent = 'Model Sync'
          title.style.cssText = 'font-size:16px;font-weight:600;line-height:24px;margin:0;color:var(--dsw-alias-label-primary)'

          const intro = document.createElement('p')
          intro.textContent = 'Sync the model list of every configured provider against its /v1/models endpoint. The stored list is replaced: models the endpoint no longer advertises are removed, and other provider fields are kept.'
          intro.style.cssText = 'font-size:14px;line-height:22px;margin:0;color:var(--dsw-alias-label-tertiary)'

          // auto-sync toggle
          const toggleRow = document.createElement('label')
          toggleRow.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:14px;line-height:22px;cursor:pointer'
          const toggle = document.createElement('input')
          toggle.type = 'checkbox'
          toggle.checked = readLocalAutoSync()
          const toggleText = document.createElement('span')
          toggleText.textContent = 'Auto-sync on conversation open'
          toggleRow.append(toggle, toggleText)
          toggle.addEventListener('change', () => {
            void persistAutoSync(toggle.checked)
          })

          // manual sync button + status line
          const button = document.createElement('button')
          button.textContent = 'Sync All Models'
          button.style.cssText = 'align-self:flex-start;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border:none;border-radius:18px;padding:0 14px;height:36px;font-size:14px;line-height:22px;cursor:pointer'

          const status = document.createElement('div')
          status.style.cssText = 'font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary);white-space:pre-wrap'

          button.addEventListener('click', () => {
            button.disabled = true
            button.textContent = 'Syncing…'
            status.style.color = 'var(--dsw-alias-label-tertiary)'
            status.textContent = ''
            void syncAllModels().then((result) => {
              if (!result.ok) {
                status.style.color = 'var(--dsw-alias-state-error-primary)'
                status.textContent = `${result.message ?? 'sync failed'}`
                return
              }
              if (result.routes.length === 0) {
                status.textContent = result.message ?? 'no providers configured'
                return
              }
              const lines = result.routes.map((r) => r.error != null
                ? `${r.route}: ❌ ${r.error}`
                : `${r.route}: ✅ ${r.total} total${r.added > 0 ? ` (+${r.added} added)` : ''}${r.removed > 0 ? ` (-${r.removed} removed)` : ''}`)
              status.style.color = 'var(--dsw-alias-label-tertiary)'
              status.textContent = lines.join('\n')
            }).catch((error) => {
              status.style.color = 'var(--dsw-alias-state-error-primary)'
              status.textContent = String(error)
            }).finally(() => {
              button.disabled = false
              button.textContent = 'Sync All Models'
            })
          })

          // how-it-works block
          const divider = document.createElement('hr')
          divider.style.cssText = 'border:none;border-top:1px solid var(--dsw-alias-line-primary);margin:8px 0'
          const help = document.createElement('div')
          help.style.cssText = 'font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)'
          help.textContent = 'How it works: opening any conversation page makes the Host half re-discover every provider and write the model list back (debounced, ~10s cooldown). Use the button above to sync immediately. Manual sync runs entirely in the browser through the official settings and LLM APIs.'

          root.append(title, intro, toggleRow, button, status, divider, help)
          return root
        },
      }),
    }),
    'dsh-model-sync: settings section',
  )
}