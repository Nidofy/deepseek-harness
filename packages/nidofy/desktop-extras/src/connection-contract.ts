/** Optional managed-connection integration: a batch can pin its immutable route before preparing any calls. */
import type { Context } from '@deepseek-ai/cordis'
declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Return an immutable managed provider route, or undefined for an unowned provider.
     * @mode bail
     * @param provider - Public provider alias whose current revision the caller freezes.
     */
    'nidofy/connection-route'(provider: string): string | undefined
  }
}
export function freezeRoute(ctx: Context, provider: string): string {
  return ctx.bail('nidofy/connection-route', provider) ?? provider
}
