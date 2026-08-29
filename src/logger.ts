/**
 * Logging helper — wraps a namespace string for ctx.logger usage.
 */
export function prefixLogger(ctx: { logger?: { info: (msg: string) => void } }): {
  info: (msg: string) => void
  warn: (msg: string) => void
} {
  return {
    info: (msg: string) => void ctx.logger?.info?.(`[dsh-model-sync] ${msg}`),
    warn: (msg: string) => void ctx.logger?.warn?.(`[dsh-model-sync] ${msg}`),
  }
}