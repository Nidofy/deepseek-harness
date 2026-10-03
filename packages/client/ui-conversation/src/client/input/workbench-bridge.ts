/** Same-origin desktop review tickets append through the official input actions and revision check. */
import type { InputActions, InputState } from '../contract/input.ts'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
interface Composer {
  readonly snapshot: InputState
  readonly actions: InputActions
}
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
/** Append at the end without replacing text, reference chips, or attachments.
 * @param composer - Official resident composer.
 * @param revision - User-selected draft revision.
 * @param text - Host-validated excerpt.
 * @returns Whether the unchanged, editable draft accepted the append.
 */
export function appendWorkbenchExcerpt(composer: Composer, revision: number, text: string): boolean {
  const state = composer.snapshot
  if (state.phase !== 'plain' || state.draftRev !== revision)
    return false
  // InputState exposes clipboard text; insertion spans count each reference chip as one character.
  const end = state.draft.length - state.occurrences.reduce((removed, chip) => removed + chip.length - 1, 0)
  return composer.actions.insertText(text, { start: end, end, draftRev: revision })
}
/** Bind a session-scoped bridge; only a ticket claimed from the authenticated Host can supply text.
 * @param sessionId - Exact resident session.
 * @param composer - Official input owner.
 * @returns Disposer for the channel and pending requests.
 */
export function installWorkbenchDraftBridge(sessionId: string, composer: Composer): () => void {
  if (typeof location === 'undefined' || location.protocol !== 'dsh-app:' || location.hostname !== 'app' || typeof BroadcastChannel === 'undefined')
    return () => { }
  const channel = new BroadcastChannel('nidofy-workbench-drafts'), clientId = randomUUID(), lifetime = new AbortController()
  const pending = new Set<string>()
  const request = async (method: string, input: object): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/nidofy/workbench/draft/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(10000)]) })
    const value: unknown = await response.json(), parsed = record(value)
    if (!response.ok || !parsed)
      throw Error('DRAFT_REQUEST_FAILED')
    return parsed
  }
  channel.onmessage = (event) => {
    const data = record(event.data)
    if (!data)
      return
    if (data.type === 'discover' && typeof data.nonce === 'string') {
      const state = composer.snapshot
      channel.postMessage({ type: 'composer', nonce: data.nonce, sessionId, clientId, revision: state.draftRev, attachmentCount: state.attachmentIds.length, phase: state.phase })
      return
    }
    if (data.type !== 'append' || data.sessionId !== sessionId || data.clientId !== clientId || typeof data.ticket !== 'string' || pending.has(data.ticket))
      return
    const ticket = data.ticket
    pending.add(ticket)
    void (async () => {
      const value = await request('claim', { ticket, sessionId, clientId })
      if (value.status !== 'CLAIMED') {
        channel.postMessage({ type: 'receipt', ticket, status: value.status })
        return
      }
      const appended = value.sessionId === sessionId && typeof value.revision === 'number' && typeof value.text === 'string' && appendWorkbenchExcerpt(composer, value.revision, value.text)
      const result = await request('settle', { ticket, sessionId, clientId, status: appended ? 'APPENDED' : 'REFUSED' })
      channel.postMessage({ type: 'receipt', ticket, status: result.status })
    })().catch(() => { if (!lifetime.signal.aborted)
      channel.postMessage({ type: 'receipt', ticket, status: 'UNKNOWN' }) }).finally(() => pending.delete(ticket))
  }
  return () => { lifetime.abort(); channel.close() }
}
