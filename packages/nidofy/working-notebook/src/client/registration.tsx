/** Independent notebook settings and an optional contribution to the desktop environment rail. */
import type { Context } from '@deepseek-ai/cordis'
import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@nidofy/dsh-desktop-extras/client'
import { NotebookPanel } from './NotebookPanel.tsx'
import { Enhancement } from './Enhancement.tsx'
import { en, zh } from './locales.ts'
import { notebookCss } from './style.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'nidofy.notebook': keyof typeof en }
}
function Rail({ sessionId, t }: { sessionId: string } & PropsLocale<'nidofy.notebook'>) {
  const [open, setOpen] = useState(false)
  return <div className="nidofy-notebook-surface"><button className="nidofy-row" aria-expanded={open} onClick={() => { setOpen(!open) }}><span>{t('notebook')}</span></button>{open && <NotebookPanel key={sessionId} sessionId={sessionId} t={t} />}</div>
}
function Settings({ useSessions, t }: PropsRuntime<'settings.section'> & PropsLocale<'nidofy.notebook'>) {
  const sessionId = useSessions(state => Object.values(state.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)?.id)
  return <section className="nidofy-notebook-surface">{sessionId ? <NotebookPanel key={sessionId} sessionId={sessionId} t={t} /> : <><h2>{t('notebook')}</h2><Enhancement t={t} /><p>{t('chooseConversation')}</p></>}</section>
}
export const name = 'nidofy-working-notebook-client'
export const inject = ['slots', 'locale', 'uiWorkspace']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('nidofy.notebook', { en, zh }))
  const t = ctx.locale.bind('nidofy.notebook')
  ctx.slots.inject('nidofy.notebook', () => ctx.slots.register({ name: 'nidofy.notebook', locale: 'nidofy.notebook' }, Rail))
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'nidofy-notebook', order: 45, label: () => t('notebook'), locale: 'nidofy.notebook' }, Settings))
  ctx.effect(() => {
    const style = document.createElement('style'); style.textContent = notebookCss; document.head.append(style)
    return () => { style.remove() }
  })
}
