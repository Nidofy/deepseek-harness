import { expect, it, onTestFinished } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import SqliteQuery from '@deepseek-ai/dsh-session-query-sqlite'
import { SessionId, Session } from '@deepseek-ai/dsh-session'
import { LlmAdapter, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import NotebookCompaction, { installNotebookCompaction } from '../src/compaction.ts'
import { installContext } from '../src/context.ts'
import type { Notebook } from '../src/notebook.ts'

class Model extends LlmAdapter {
  requests: GenerateOptions[] = []
  malformed = false
  fail = false
  beforeSummary: ((options: GenerateOptions) => Promise<void>) | undefined
  override async resolveModel(provider: string, id: string) {
    return { provider, id, name: id, context: { contextWindow: 100000, maxOutputTokens: 4096 } }
  }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (this.fail && options.purpose === 'compaction') throw Error('synthetic-model-failure')
    const appendix = options.messages.flatMap(message => message.content).flatMap(block => block.type === 'text' && block.text.includes('Also include one <nidofy-notebook-delta>') ? [block.text] : [])[0]
    let answer = options.purpose === 'compaction' ? 'Keep official engine; continue verification.' : 'Acknowledged.'
    if (appendix) {
      await this.beforeSummary?.(options)
      const payload = JSON.parse(appendix.slice(appendix.lastIndexOf('\n') + 1)) as { previous: Notebook; sourceThrough: number; sources: { seq: number; excerpt: string }[] }
      const source = payload.sources[0]!
      answer += '<nidofy-notebook-delta>' + (this.malformed ? '{}' : JSON.stringify({ baseRevision: payload.previous.revision, sourceThrough: payload.sourceThrough, operations: [{ action: 'ADD', id: 'constraint-' + String(payload.previous.revision), kind: 'constraint', text: 'Keep official engine', seq: source.seq, quote: source.excerpt.slice(0, 20) }] })) + '</nidofy-notebook-delta>'
    }
    yield { type: 'text-delta', index: 0, text: answer }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'nidofy-context-')), ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(home, { recursive: true, force: true }) })
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(TokenMeter)
  await ctx.plugin(SqliteQuery, { path: join(home, 'search.sqlite'), openAt: 'first-search' })
  let api: ReturnType<typeof installContext> | undefined
  const policy = { enabled: true, revision: 0 }
  const owner = await ctx.plugin({ name: 'context-test', inject: ['tools', 'sessionQuery', 'sessions', 'systemPrompt'], apply(child: Context) {
    api = installContext(child, join(home, 'notes'), { maxEntries: 64, maxBytes: 16384 })
    installNotebookCompaction(child, () => ({ ...policy }))
  } })
  if (!api) throw Error('Context did not activate')
  const model = new Model(); ctx.llm.registerAdapter(['test'], model)
  await ctx.plugin(NotebookCompaction, { auto: false })
  const agent = await ctx.agentLoop.create(SessionId('notebook-integration'), { provider: 'test', model: 'test' })
  const turn = async (body: string) => { agent.followup(createUserMessage({ content: [{ type: 'text', text: body }], source: { kind: 'user' } })); await agent.whenIdle() }
  await turn('Keep official engine. Long task evidence '.repeat(250))
  return { ctx, api, model, agent, turn, owner, policy }
}
it('publishes notes only after real compaction, logs their next-turn snapshot and still searches the shadowed evidence', async () => {
  const { ctx, api, model, agent, turn } = await fixture()
  expect((await ctx.nidofyNotebook.read(agent.session.id)).revision).toBe(0)
  const result = await ctx.compaction.compactNow(agent, new AbortController().signal)
  expect(result).not.toBeNull()
  const status = await api('status', { sessionId: agent.session.id }) as { notebook: Notebook }
  expect(status.notebook.revision).toBe(1)
  expect(status.notebook.entries[0]?.text).toBe('Keep official engine')
  expect(model.requests.filter(row => row.purpose === 'compaction').at(-1)?.messages.at(-1)?.content).toMatchSnapshot('enhanced trailing directive')
  expect((await ctx.sessionQuery.searchEvents({ sessionId: agent.session.id, query: 'Long task evidence' })).items.some(hit => hit.surface === 'shadowed')).toBe(true)
  await turn('Continue using the saved constraint.')
  const observation = await ctx.sessionQuery.observeSession(agent.session.id)
  try {
    const snapshot = observation.events.find(event => event.type === 'user/message' && event.data.source.kind === 'runtime-context')
    expect(snapshot?.type).toBe('user/message')
    const replay = Session.create(agent.session.id, observation.events, observation.header, observation.inheritedEventCount)
    expect(replay.deriveMessages()).toEqual(agent.session.deriveMessages())
  } finally { observation[Symbol.dispose]() }
  expect(model.requests.at(-1)?.messages.flatMap(message => message.content).some(block => block.type === 'text' && block.text.includes('Working notes at this turn boundary'))).toBe(true)
  expect(model.requests.at(-1)?.messages.flatMap(message => message.content).filter(block => block.type === 'text' && block.text.includes('Working notes at this turn boundary'))).toMatchSnapshot()
})
it('falls back to basic on malformed notebook output without publishing a candidate', async () => {
  const { ctx, api, model, agent } = await fixture(); model.malformed = true
  expect(await ctx.compaction.compactNow(agent, new AbortController().signal)).not.toBeNull()
  expect((await api('status', { sessionId: agent.session.id }) as { notebook: Notebook }).notebook.revision).toBe(0)
  expect(model.requests.filter(row => row.purpose === 'compaction')).toHaveLength(2)
})
it('does not publish notes when the model fails or compaction is cancelled', async () => {
  const { ctx, api, model, agent } = await fixture(); model.fail = true
  await expect(ctx.compaction.compactNow(agent, new AbortController().signal)).rejects.toThrow()
  expect((await api('status', { sessionId: agent.session.id }) as { notebook: Notebook }).notebook.revision).toBe(0)
  const controller = new AbortController(); controller.abort()
  expect(() => ctx.compaction.compactNow(agent, controller.signal)).toThrow()
  expect((await ctx.nidofyNotebook.read(agent.session.id)).revision).toBe(0)
})
it('does not publish a completed candidate when Session persistence rejects the flush', async () => {
  const { ctx, agent } = await fixture()
  ctx.on('session/flush', () => { throw Error('synthetic-persistence-failure') })
  await expect(ctx.compaction.compactNow(agent, new AbortController().signal)).rejects.toThrow()
  await new Promise(resolve => setTimeout(resolve, 20))
  expect((await ctx.nidofyNotebook.read(agent.session.id)).revision).toBe(0)
})
it('removes note tools and turn observers when the optional owner is unloaded', async () => {
  const { ctx, owner, turn, agent } = await fixture()
  expect(ctx.tools.get('notebook_update')).toBeDefined()
  await owner.dispose()
  expect(ctx.tools.get('notebook_update')).toBeUndefined()
  expect(ctx.get('nidofyNotebook')).toBeUndefined()
  await turn('Continue the standard conversation without notes.')
  expect(agent.status).toBe('idle')
})

it('retains a human pinned constraint through three incremental compactions and original-history retrieval', async () => {
  const { ctx, api, agent, turn } = await fixture()
  const sources = await api('events', { sessionId: agent.session.id }) as { seq: number; type: string; text: string }[]
  const original = sources.find(row => row.type === 'user/message')!
  await api('update', { sessionId: agent.session.id, delta: { baseRevision: 0, sourceThrough: original.seq,
    operations: [{ action: 'ADD', id: 'human', kind: 'constraint', text: 'Pinned {{literal}} constraint', pinned: true, seq: original.seq, quote: 'Keep official engine' }] } })
  for (let cycle = 0; cycle < 3; cycle++) {
    await turn(('Keep official engine. New verification evidence ' + String(cycle) + '. ').repeat(250))
    expect(await ctx.compaction.compactNow(agent, new AbortController().signal)).not.toBeNull()
    const state = await api('status', { sessionId: agent.session.id }) as { notebook: Notebook }
    expect(state.notebook.revision).toBe(cycle + 2)
    expect(state.notebook.entries.find(row => row.id === 'human')).toMatchObject({ text: 'Pinned {{literal}} constraint', pinned: true, revision: 1 })
  }
  expect((await ctx.sessionQuery.searchEvents({ sessionId: agent.session.id, query: 'Long task evidence' })).items.some(hit => hit.seq === original.seq && hit.surface === 'shadowed')).toBe(true)
})

it('toggles organization for the same official engine without replacing its tools or preset', async () => {
  const { ctx, api, model, agent, turn, policy } = await fixture()
  policy.enabled = false; policy.revision++
  await ctx.compaction.compactNow(agent, new AbortController().signal)
  expect(model.requests.filter(row => row.purpose === 'compaction')).toHaveLength(1)
  expect(JSON.stringify(model.requests.at(-1)?.messages)).not.toContain('Also include one <nidofy-notebook-delta>')
  expect((await ctx.nidofyNotebook.read(agent.session.id)).revision).toBe(0)
  policy.enabled = true; policy.revision++
  await turn('Another long official conversation '.repeat(250))
  await ctx.compaction.compactNow(agent, new AbortController().signal)
  const notes = await api('status', { sessionId: agent.session.id }) as { notebook: Notebook }
  expect(notes.notebook.revision).toBe(1)
  policy.enabled = false; policy.revision++
  await turn('Keep these notes while using official compaction '.repeat(250))
  expect(JSON.stringify(model.requests.at(-1)?.messages)).toContain('Working notes at this turn boundary')
  await ctx.compaction.compactNow(agent, new AbortController().signal)
  expect(JSON.stringify(model.requests.at(-1)?.messages)).not.toContain('Also include one <nidofy-notebook-delta>')
  expect((await ctx.nidofyNotebook.read(agent.session.id)).revision).toBe(1)
})

it('discards a candidate if the user disables organization while its model request is pending', async () => {
  const { ctx, api, model, agent, policy } = await fixture()
  const entered = Promise.withResolvers<undefined>(), release = Promise.withResolvers<undefined>()
  model.beforeSummary = () => { entered.resolve(undefined); return release.promise }
  const compacting = ctx.compaction.compactNow(agent, new AbortController().signal)
  await entered.promise
  policy.enabled = false; policy.revision++
  release.resolve(undefined)
  expect(await compacting).not.toBeNull()
  expect((await api('status', { sessionId: agent.session.id }) as { notebook: Notebook }).notebook.revision).toBe(0)
})

it('cancels and drains an in-flight enhancement when its plugin is disabled', async () => {
  const { ctx, model, agent, owner } = await fixture()
  const entered = Promise.withResolvers<undefined>()
  model.beforeSummary = options => new Promise((resolve, reject) => {
    entered.resolve(undefined)
    if (options.signal?.aborted) { reject(new Error('Summary aborted')); return }
    options.signal?.addEventListener('abort', () => { reject(new Error('Summary aborted')) }, { once: true })
    if (!options.signal) resolve()
  })
  const compacting = ctx.compaction.compactNow(agent, new AbortController().signal)
  const failed = expect(compacting).rejects.toThrow()
  await entered.promise
  await owner.dispose()
  await failed
  expect(ctx.tools.get('notebook_read')).toBeUndefined()
})
