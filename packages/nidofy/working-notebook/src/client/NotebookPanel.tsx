/** In-rail notes and source search; user edits remain explicit versioned operations. */
import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Notebook, Note } from '@nidofy/dsh-desktop-extras/notebook-types'
import { Enhancement } from './Enhancement.tsx'

interface Source { seq: number; type: string; text: string }
interface Status { notebook: Notebook; sourceThrough: number; index: string }
interface Hit { sessionId: string; seq: number; snippet: string; surface: string }
async function request<T>(method: string, input: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/nidofy-notebook/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), ...(signal ? { signal } : {}) })
  const value = await response.json() as T & { error?: string }
  if (!response.ok) throw Error(value.error ?? 'CONTEXT_UNAVAILABLE')
  return value
}
/** Mount under a Session key so late responses cannot cross conversation switches. */
export function NotebookPanel({ sessionId, t }: PropsLocale<'nidofy.notebook'> & { sessionId: string }) {
  const [status, setStatus] = useState<Status>(), [events, setEvents] = useState<Source[]>([])
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [revision, refresh] = useState(0)
  const [query, setQuery] = useState(''), [scope, setScope] = useState('session'), [results, setResults] = useState<Hit[]>()
  const [preview, setPreview] = useState('')
  const [selected, setSelected] = useState<Note>(), [draft, setDraft] = useState(''), [kind, setKind] = useState<Note['kind']>('constraint')
  const [source, setSource] = useState(''), [quote, setQuote] = useState(''), [pinned, setPinned] = useState(true)
  useEffect(() => {
    const abort = new AbortController()
    void Promise.all([request<Status>('status', { sessionId }, abort.signal), request<Source[]>('events', { sessionId }, abort.signal)])
      .then(([state, sources]) => { if (!abort.signal.aborted) { setStatus(state); setEvents(sources) } })
      .catch((error: unknown) => { if (!abort.signal.aborted) setError(String(error)) })
    return () => { abort.abort() }
  }, [sessionId, revision])
  const edit = (row?: Note) => { setSelected(row); setDraft(row?.text ?? ''); setKind(row?.kind ?? 'constraint'); setSource(row ? String(row.seq) : ''); setQuote(row?.quote ?? ''); setPinned(row?.pinned ?? true) }
  const save = async (remove = false) => {
    if (!status) return
    setBusy(true); setError('')
    const operation = remove && selected ? { action: 'REMOVE', id: selected.id } : {
      action: selected ? 'UPDATE' : 'ADD', id: selected?.id ?? '', expectedRevision: selected?.revision,
      kind, text: draft, seq: Number(source), quote, pinned,
    }
    try {
      await request('update', { sessionId, delta: { baseRevision: status.notebook.revision, sourceThrough: status.sourceThrough, operations: [operation] } })
      edit(); refresh(value => value + 1)
    } catch (error) { setError(String(error)); refresh(value => value + 1) }
    finally { setBusy(false) }
  }
  return <div className="nidofy-detail nidofy-notebook">
    <header><strong>{t('notebook')}</strong><button onClick={() => { refresh(value => value + 1) }}>{t('refresh')}</button></header>
    <Enhancement t={t} />
    <p>{t('contextNotice')}</p>
    <small>{t('indexOnDemand')} · {t('revision')} {status?.notebook.revision ?? 0}</small>
    <form onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(''); setResults(undefined); void request<{ items: Hit[] }>('search', { sessionId, query, scope }).then((value) => { setResults(value.items) }).catch((error: unknown) => { setError(String(error)) }).finally(() => { setBusy(false) }) }}>
      <label>{t('historySearch')}<input value={query} onChange={(event) => { setQuery(event.target.value) }} required /></label>
      <select aria-label={t('searchScope')} value={scope} onChange={(event) => { setScope(event.target.value) }}><option value="session">{t('currentSession')}</option><option value="workspace">{t('sameWorkspace')}</option></select>
      <button disabled={busy || !query.trim()}>{t('search')}</button>
    </form>
    {results && <div className="nidofy-change-list" aria-label={t('searchResults')}>{results.length === 0 && <p>{t('noMatches')}</p>}{results.map(hit => <button key={hit.sessionId + ':' + String(hit.seq)} onClick={() => { void request<Source>('source', { sessionId: hit.sessionId, seq: hit.seq }).then((value) => { setPreview(value.text) }).catch((error: unknown) => { setError(String(error)) }) }}><span>{hit.snippet}<small> · {hit.sessionId} #{hit.seq} · {hit.surface}</small></span></button>)}</div>}
    {preview && <pre aria-label={t('sourceEvent')}>{preview}</pre>}
    <div className="nidofy-change-list">{status?.notebook.entries.filter(row => row.active).map(row => <button key={row.id} onClick={() => { edit(row) }}><span>{row.pinned ? '● ' : ''}{row.text}<small> · #{row.seq}</small></span></button>)}</div>
    <form onSubmit={(event) => { event.preventDefault(); void save() }}>
      <label>{t('noteText')}<textarea value={draft} onChange={(event) => { setDraft(event.target.value) }} maxLength={2048} required /></label>
      <select aria-label={t('noteKind')} value={kind} onChange={(event) => { setKind(event.target.value as Note['kind']) }}>{(['objective', 'constraint', 'decision', 'file', 'verification', 'failure', 'issue', 'next'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</select>
      <label>{t('sourceEvent')}<select value={source} onChange={(event) => { setSource(event.target.value); setQuote('') }} required><option value="">{t('chooseSource')}</option>{events.map(event => <option key={event.seq} value={event.seq}>#{event.seq} {event.type}</option>)}{selected && !events.some(event => event.seq === selected.seq) && <option value={selected.seq}>#{selected.seq}</option>}</select></label>
      {source && <pre>{events.find(event => event.seq === Number(source))?.text ?? selected?.quote}</pre>}
      <label>{t('sourceQuote')}<textarea value={quote} onChange={(event) => { setQuote(event.target.value) }} maxLength={512} required /></label>
      <label className="nidofy-note-pin"><input type="checkbox" checked={pinned} onChange={(event) => { setPinned(event.target.checked) }} />{t('pinNote')}</label>
      <div className="nidofy-inline-actions"><button disabled={busy || !status}>{t('saveNote')}</button><button type="button" onClick={() => { edit() }}>{t('newNote')}</button>{selected && <button type="button" disabled={busy} onClick={() => { void save(true) }}>{t('retireNote')}</button>}</div>
    </form>
    {error && <p role="alert">{t('contextError')} {error}</p>}
  </div>
}
