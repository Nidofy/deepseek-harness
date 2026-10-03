import { expect, it, onTestFinished } from 'vitest'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import { applyNotebookDelta, emptyNotebook, NotebookStore } from '../src/notebook.ts'
import { notebookCandidate } from '../src/compaction.ts'

const limits = { maxEntries: 8, maxBytes: 8192 }
const events: SessionEvent[] = [{ type: 'user/message', seq: SessionSeq(0), time: 1, data: createUserMessage({ content: [{ type: 'text', text: 'Keep the official engine. Test run is planned, not yet verified.' }], source: { kind: 'user' } }), surfaceOp: 'append' }]
const delta = { baseRevision: 0, sourceThrough: 0, operations: [{ action: 'ADD', id: 'engine', kind: 'constraint', text: 'Keep the official engine', seq: 0, quote: 'Keep the official engine', pinned: true }] }
it('keeps pinned constraints, exact evidence and previous versions across concurrent updates and restart', async () => {
  const home = await mkdtemp(join(tmpdir(), 'nidofy-notes-'))
  onTestFinished(() => rm(home, { recursive: true, force: true }))
  const store = new NotebookStore(home, limits)
  const first = await store.update('session', delta, events, 'user')
  expect(first.entries[0]?.pinned).toBe(true)
  await expect(store.update('session', { baseRevision: 1, sourceThrough: 0, operations: [{ action: 'REMOVE', id: 'engine' }] }, events, 'model')).rejects.toThrow('NOTEBOOK_PINNED')
  const writes = await Promise.allSettled([store.update('session', { baseRevision: 1, sourceThrough: 0, operations: [] }, events, 'user'), store.update('session', { baseRevision: 1, sourceThrough: 0, operations: [] }, events, 'user')])
  expect(writes.map(row => row.status).sort()).toEqual(['fulfilled', 'rejected'])
  await store.close()
  expect(await new NotebookStore(home, limits).read('session')).toMatchObject({ revision: 2, sourceThrough: 0, entries: [{ pinned: true }] })
  const directory = (await readdir(home))[0]!
  expect((await readdir(join(home, directory))).filter(name => name.startsWith('revision-'))).toHaveLength(2)
})
it('rejects fabricated source, future cursors, stale revisions and oversized multibyte snapshots', () => {
  const initial = emptyNotebook('session')
  expect(() => applyNotebookDelta(initial, { ...delta, operations: [{ ...delta.operations[0], quote: 'all tests passed' }] }, events, 'model', limits)).toThrow('EVIDENCE_MISMATCH')
  expect(() => applyNotebookDelta(initial, { ...delta, sourceThrough: 1 }, events, 'model', limits)).toThrow('SOURCE_CONFLICT')
  expect(() => applyNotebookDelta(initial, { ...delta, baseRevision: 2 }, events, 'model', limits)).toThrow('REVISION_CONFLICT')
  expect(() => applyNotebookDelta(initial, { ...delta, operations: [{ ...delta.operations[0], text: '中文'.repeat(300) }] }, events, 'model', { ...limits, maxBytes: 1024 })).toThrow('BUDGET_EXCEEDED')
})
it('allows human correction with explicit previous entry revision and retains retired records', () => {
  const first = applyNotebookDelta(emptyNotebook('session'), delta, events, 'user', limits)
  const correction = { ...delta.operations[0], action: 'UPDATE', text: 'Use official engine; changes need validation', expectedRevision: 1 }
  const second = applyNotebookDelta(first, { baseRevision: 1, sourceThrough: 0, operations: [correction] }, events, 'user', limits)
  expect(first.entries[0]?.text).toBe('Keep the official engine')
  expect(second.entries[0]?.revision).toBe(2)
  expect(applyNotebookDelta(second, { baseRevision: 2, sourceThrough: 0, operations: [{ action: 'REMOVE', id: 'engine' }] }, events, 'user', limits).entries[0]?.active).toBe(false)
})
it('does not publish an aborted delta or advance its source cursor', async () => {
  const home = await mkdtemp(join(tmpdir(), 'nidofy-notes-abort-'))
  onTestFinished(() => rm(home, { recursive: true, force: true }))
  const store = new NotebookStore(home, limits), controller = new AbortController()
  controller.abort()
  await expect(store.update('session', delta, events, 'user', controller.signal)).rejects.toThrow()
  expect(await store.read('session')).toEqual(emptyNotebook('session'))
})
it('accepts only one complete candidate block from a committed summary', () => {
  expect(notebookCandidate('ordinary basic summary')).toBeUndefined()
  expect(notebookCandidate('<nidofy-notebook-delta>' + JSON.stringify(delta) + '</nidofy-notebook-delta>')).toEqual(delta)
  expect(() => notebookCandidate('<nidofy-notebook-delta>{')).toThrow('INVALID_CANDIDATE')
})
