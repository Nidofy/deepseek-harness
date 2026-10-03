/** Versioned working notes; immutable revisions retain evidence and user corrections. */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { extractSessionEventText } from '@deepseek-ai/dsh-session-query'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { object, text } from './state.ts'

/** Notebook categories describe current work rather than a chronological summary. */
export const notebookKinds = ['objective', 'constraint', 'decision', 'file', 'verification', 'failure', 'issue', 'next'] as const
import type { Note, Notebook, NotebookLimits } from './shared/notebook-types.ts'
export type { Note, Notebook, NotebookLimits } from './shared/notebook-types.ts'
/** Empty notebooks have no processed source events. */
export function emptyNotebook(sessionId: string): Notebook {
  return { schemaVersion: 1, sessionId, revision: 0, sourceThrough: -1, entries: [] }
}
function integer(value: unknown, min: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) throw Error('NOTEBOOK_INVALID_NUMBER')
  return value
}
function note(value: unknown): Note {
  const p = object(value), kind = text(p.kind, 32)
  if (!notebookKinds.includes(kind as Note['kind']) || typeof p.pinned !== 'boolean' || typeof p.active !== 'boolean') throw Error('NOTEBOOK_INVALID_ENTRY')
  return { id: text(p.id, 80), kind: kind as Note['kind'], text: text(p.text, 2048), seq: integer(p.seq, 0), quote: text(p.quote, 512), pinned: p.pinned, active: p.active, revision: integer(p.revision, 1) }
}
/** Validate durable or model-supplied notebook bytes before they become state. */
export function parseNotebook(value: unknown, sessionId: string, limits: NotebookLimits): Notebook {
  const p = object(value)
  if (p.schemaVersion !== 1 || p.sessionId !== sessionId || !Array.isArray(p.entries)) throw Error('NOTEBOOK_INVALID_STATE')
  const result: Notebook = { schemaVersion: 1, sessionId, revision: integer(p.revision, 0),
    sourceThrough: integer(p.sourceThrough, -1), entries: p.entries.map(note) }
  if (new Set(result.entries.map(row => row.id)).size !== result.entries.length || result.entries.some(row => row.revision > result.revision)) throw Error('NOTEBOOK_INVALID_STATE')
  bounded(result, limits)
  return result
}
function bounded(value: Notebook, limits: NotebookLimits): void {
  if (value.entries.length > limits.maxEntries || Buffer.byteLength(JSON.stringify(value)) > limits.maxBytes) throw Error('NOTEBOOK_BUDGET_EXCEEDED')
}
/** Apply an explicit delta with source checks; models cannot change pinned entries. */
export function applyNotebookDelta(previous: Notebook, input: unknown, events: readonly SessionEvent[], actor: 'user' | 'model', limits: NotebookLimits): Notebook {
  const p = object(input)
  if (p.baseRevision !== previous.revision) throw Error('NOTEBOOK_REVISION_CONFLICT')
  const through = integer(p.sourceThrough, -1)
  if (through < previous.sourceThrough || through >= events.length) throw Error('NOTEBOOK_SOURCE_CONFLICT')
  if (!Array.isArray(p.operations) || p.operations.length > limits.maxEntries) throw Error('NOTEBOOK_INVALID_DELTA')
  const next = structuredClone(previous), seen = new Set<string>()
  next.revision++; next.sourceThrough = through
  for (const raw of p.operations) {
    const op = object(raw), id = text(op.id, 80), prior = next.entries.find(row => row.id === id)
    if (seen.has(id)) throw Error('NOTEBOOK_DUPLICATE_OPERATION')
    seen.add(id)
    if (op.action === 'KEEP') { if (!prior) throw Error('NOTEBOOK_ENTRY_MISSING'); continue }
    if (prior?.pinned && actor === 'model') throw Error('NOTEBOOK_PINNED')
    if (op.action === 'REMOVE') {
      if (!prior) throw Error('NOTEBOOK_ENTRY_MISSING')
      prior.active = false; prior.revision = next.revision; continue
    }
    if (op.action !== 'ADD' && op.action !== 'UPDATE') throw Error('NOTEBOOK_INVALID_ACTION')
    if ((op.action === 'ADD') === Boolean(prior)) throw Error('NOTEBOOK_ENTRY_CONFLICT')
    // An explicit expected revision prevents silently overwriting a changed decision.
    if (prior && op.expectedRevision !== prior.revision) throw Error('NOTEBOOK_ENTRY_CONFLICT')
    const row = note({ ...op, pinned: actor === 'user' ? op.pinned === true : false, active: true, revision: next.revision })
    const source = events[row.seq]
    if (!source || row.seq > through || !row.quote.trim() || !extractSessionEventText(source).includes(row.quote)) throw Error('NOTEBOOK_EVIDENCE_MISMATCH')
    // A note or checkpoint is not fresh evidence for another note.
    if (source.type !== 'assistant/message' && source.type !== 'tool/result'
      && !(source.type === 'user/message' && source.data.source.kind === 'user')) throw Error('NOTEBOOK_ORIGINAL_SOURCE_REQUIRED')
    if (prior) next.entries[next.entries.indexOf(prior)] = row
    else next.entries.push(row)
  }
  bounded(next, limits)
  return next
}
/** Atomic current pointer plus immutable revision files; no partial cursor publication. */
export class NotebookStore {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly home: string, readonly limits: NotebookLimits) {}
  private directory(sessionId: string): string { return join(this.home, createHash('sha256').update(sessionId).digest('hex')) }
  async read(sessionId: string): Promise<Notebook> {
    let bytes: string
    try { bytes = await readFile(join(this.directory(sessionId), 'current.json'), 'utf8') }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyNotebook(sessionId); throw error }
    const value: unknown = JSON.parse(bytes)
    return parseNotebook(value, sessionId, this.limits)
  }
  update(sessionId: string, input: unknown, events: readonly SessionEvent[], actor: 'user' | 'model', signal?: AbortSignal): Promise<Notebook> {
    const operation = this.queue.catch(() => { /* A rejected operation must not block later revisions. */ }).then(async () => {
      signal?.throwIfAborted()
      const previous = await this.read(sessionId)
      const next = applyNotebookDelta(previous, input, events, actor, this.limits)
      signal?.throwIfAborted()
      const dir = this.directory(sessionId), bytes = JSON.stringify(next) + '\n'
      await mkdir(dir, { recursive: true, mode: 0o700 })
      await writeFile(join(dir, `revision-${next.revision}-${randomUUID()}.json`), bytes, { flag: 'wx', mode: 0o600 })
      signal?.throwIfAborted()
      await writeFileAtomic(join(dir, 'current.json'), bytes, { mode: 0o600 })
      return next
    })
    this.queue = operation
    return operation
  }
  async close(): Promise<void> { await this.queue.catch(() => { /* The original caller receives write failures. */ }) }
}
