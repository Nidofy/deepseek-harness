/** Desktop pet navigation uses the official workspace service and never touches conversation DOM. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { Environment } from './Environment.tsx'
import { en, zh } from './locales.ts'
import { wallpaperCss } from './appearance.ts'
export type { CompanionOwnerProps } from './Environment.tsx'

export const name = 'nidofy-extras-client'
export const inject = ['uiWorkspace', 'slots', 'locale']
export function apply(ctx: Context): void {
  if (location.protocol !== 'dsh-app:' || location.hostname !== 'app') return
  ctx.effect(() => ctx.locale.register('nidofy.environment', { en, zh }))
  ctx.slots.inject('shell.accessory', () => ctx.slots.register({ name: 'shell.accessory', locale: 'nidofy.environment', children: {
    'nidofy.companion': { kind: 'single', scope: 'root' }, 'nidofy.notebook': { kind: 'single', scope: 'root' },
  } }, Environment))
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.nidofyAppearance = ''
    style.textContent = wallpaperCss
    const icon = document.createElement('link')
    icon.rel = 'icon'
    icon.href = '/api/nidofy-extras/assets/theme/icon.png'
    document.head.append(style, icon)
    return () => { style.remove(); icon.remove() }
  })
  ctx.effect(() => {
    const channel = new BroadcastChannel('nidofy-pet-navigation')
    channel.onmessage = (event) => {
      const data: unknown = event.data
      if (data === null || typeof data !== 'object' || !('sessionId' in data) || typeof data.sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.sessionId)) return
      ctx.uiWorkspace.openSession(brandString<SessionId>(data.sessionId))
    }
    return () =>{  channel.close() }
  })
}
