import { expect, it, onTestFinished } from 'vitest'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId, SessionSeq, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SqliteQuery from '@deepseek-ai/dsh-session-query-sqlite'

it('reopens the persistent index and locates literal Chinese, English, paths and error strings without another workspace', async () => {
  const home = await mkdtemp(join(tmpdir(), 'nidofy-history-eval-')), contexts: Context[] = []
  onTestFinished(async () => { for (const ctx of contexts) await ctx.fiber.dispose(); await rm(home, { recursive: true, force: true }) })
  const open = async () => {
    const ctx = new Context(); contexts.push(ctx)
    await ctx.plugin(SessionStore)
    await ctx.plugin(JsonlPersistence, { root: join(home, 'sessions'), compression: 'none' })
    await ctx.plugin(SqliteQuery, { path: join(home, 'index.sqlite'), openAt: 'first-search' })
    return ctx
  }
  const first = await open()
  const fixtures = [
    { id: 'chinese', body: '桌宠自动关注任务', query: '桌宠自动关注任务' },
    { id: 'english', body: 'cache invalidation fixed after route change', query: 'cache invalidation' },
    { id: 'path', body: 'Changed src/client/Environment.tsx', query: 'src/client/Environment.tsx' },
    { id: 'error', body: 'Failure ECONNREFUSED 172.16.10.6:18080', query: 'ECONNREFUSED' },
  ]
  for (const row of [...fixtures, { id: 'foreign', body: 'cache invalidation secret-other-workspace', query: '' }]) {
    const writer = await first.sessionPersistence.create({ version: SESSION_FORMAT_VERSION, id: SessionId(row.id), createdAt: 1, cwd: row.id === 'foreign' ? '/other' : '/work', isSeeded: false })
    await writer.append([{ type: 'user/message', seq: SessionSeq(0), time: 2, data: createUserMessage({ content: [{ type: 'text', text: row.body }], source: { kind: 'user' } }), surfaceOp: 'append' }])
    await writer.close()
  }
  const search = (ctx: Context, query: string) => ctx.sessionQuery.searchSessions({ query, sessionFilters: [{ kind: 'cwd', values: ['/work'] }] })
  for (const row of fixtures) expect((await search(first, row.query)).items.map(item => item.header.id)).toContain(row.id)
  expect((await stat(join(home, 'index.sqlite'))).size).toBeGreaterThan(0)
  await first.fiber.dispose(); contexts.splice(contexts.indexOf(first), 1)
  const reopened = await open()
  for (const row of fixtures) {
    const hits = (await search(reopened, row.query)).items
    expect(hits.map(item => item.header.id)).toContain(row.id)
    expect(hits.some(item => item.header.id === 'foreign')).toBe(false)
    expect(hits.find(item => item.header.id === row.id)?.bestMatch.seq).toBe(0)
  }
  // unicode61 treats a contiguous Chinese phrase as one token: do not promise substring or semantic recall.
  expect((await search(reopened, '自动关注')).items).toHaveLength(0)
})
