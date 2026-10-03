/** Responsive desktop accessory rail; repository data follows the displayed Session. */
import { useEffect, useRef, useState } from 'react'
import type { PropsRuntime, PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { EnvironmentExplorer } from './EnvironmentExplorer.tsx'
import { Icon } from './EnvironmentIcon.tsx'
import type { en } from './locales.ts'
import { appearanceCss } from './appearance.ts'

/** Replaceable character renderer. Live2D occupants pause on inactive and release their renderer on unmount. */
export interface CompanionOwnerProps {
  /** True only while the rail fits and the document is visible. */
  active: boolean
  /** Currently displayed Session, absent on the welcome screen. */
  sessionId: SessionId | undefined
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'nidofy.environment': keyof typeof en }
  interface SlotMap {
    /** Optional independently owned working-notebook panel for the displayed Session. */
    'nidofy.notebook': { kind: 'single'; scope: 'root'; owner: { sessionId: string } }
    /**
     * Register a root character component without a key. It receives active and
     * sessionId from the environment rail. The single occupant replaces the local
     * static portrait fallback; absence keeps that portrait. Pause animation while
     * inactive and dispose graphics resources and listeners on unmount.
     */
    'nidofy.companion': { kind: 'single'; scope: 'root'; owner: CompanionOwnerProps }
  }
}
export interface EnvironmentInfo {
  workspace?: string
  root?: string
  head?: string | null
  branch?: string | null
  upstream?: string | null
  branches?: string[]
  remotes?: string[]
  canWrite?: boolean
  vcs?: string
  diff?: { added: number; deleted: number } | null
}
/** The rail uses normal flow and never occupies the conversation overlay layer. */
export function Environment({ useSessions, usePanelInfo, renderSlot, t }:
  PropsRuntime<'shell.accessory'> & PropsRenderSlots<'nidofy.companion' | 'nidofy.notebook'> & PropsLocale<'nidofy.environment'>,
) {
  const panel = usePanelInfo(s => s.activePanelId)
  const sessionId = useSessions(s => Object.values(s.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)?.id)
  const rail = useRef<HTMLElement>(null)
  const [active, setActive] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [revision, refresh] = useState(0), [info, setInfo] = useState<EnvironmentInfo>({}), [error, setError] = useState('')
  const native = (window as Window & {
    nidofyWorkbench?: { openPanel: (panel: string, workspace?: string) => Promise<void> }
  }).nidofyWorkbench
  useEffect(() => {
    const element = rail.current
    if (!element) return
    const measure = () => { setActive(element.getBoundingClientRect().width > 0 && !document.hidden) }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    document.addEventListener('visibilitychange', measure)
    measure()
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', measure) }
  }, [panel])
  useEffect(() => { setInfo({}); setError('') }, [sessionId])
  useEffect(() => {
    if (!active || !expanded || !sessionId) return
    const abort = new AbortController()
    let pending = false
    const load = async () => {
      if (pending) return
      pending = true
      try {
        const response = await fetch('/api/nidofy/workbench/context', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId }), signal: abort.signal })
        if (!response.ok) throw Error('ENVIRONMENT_UNAVAILABLE')
        const value = await response.json() as EnvironmentInfo
        if (!abort.signal.aborted) { setInfo(value); setError('') }
      } catch (error) { if (!abort.signal.aborted) { setError('unavailable'); console.warn('Environment request failed', error) } }
      finally { pending = false }
    }
    void load()
    const timer = setInterval(() => { void load() }, 30000)
    return () => { abort.abort(); clearInterval(timer) }
  }, [active, expanded, sessionId, revision])
  const launch = (target: string) => { void native?.openPanel(target, info.workspace).catch(() => { setError('operationFailed') }) }
  if (!native || panel !== null) return null
  return <aside className="nidofy-dock" aria-label={t('features')} ref={rail} data-active={active}>
    <style>{appearanceCss}</style>
    <section className="nidofy-environment" aria-label={t('environment')}>
      <header><button className="nidofy-collapse" aria-expanded={expanded} aria-controls="nidofy-environment-body" title={t(expanded ? 'collapse' : 'expand')} onClick={() => { setExpanded(!expanded) }}><Icon kind="environment" /><span>{t('environment')}</span><span aria-hidden="true">{expanded ? '−' : '+'}</span></button></header>
      {expanded && <div id="nidofy-environment-body">
        <p className="nidofy-workspace" title={info.workspace}>{info.workspace?.split(/[\\/]/).filter(Boolean).at(-1) ?? t(sessionId && !error ? 'loading' : 'empty')}</p>
        <EnvironmentExplorer key={sessionId ?? 'empty'} info={info} t={t} launch={launch} refresh={() => { refresh(value => value + 1) }} />
        {sessionId && renderSlot('nidofy.notebook', { sessionId })}
      </div>}
      {error && <p className="nidofy-error" role="status">{t(error === 'operationFailed' ? 'operationFailed' : 'unavailable')}</p>}
    </section>
    <section className="nidofy-companion" aria-label={t('companion')}>
      <div className="nidofy-character">{renderSlot('nidofy.companion', { active, sessionId }, { fallback: <img src="/api/nidofy-extras/assets/pets/xiaojing/portrait.png" alt={t('companion')} draggable={false} /> })}</div>
      <div className="nidofy-companion-caption"><strong>{t('companion')}</strong><p>{t('companionNote')}</p></div>
      <nav aria-label={t('features')}>{(['builds', 'artifacts', 'protection', 'pets'] as const).map(key => <button key={key} onClick={() => { launch(key) }}><Icon kind={key} /><span>{t(key)}</span></button>)}</nav>
    </section>
  </aside>
}
