import { expect, it, onTestFinished } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { Probe } from '../src/probe.ts'
import type {} from '../src/connection-contract.ts'

class Adapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  constructor(private readonly retries = 0, private readonly contextWindow = 100000) { super() }
  override providerRetryPolicy() { return resolveRetryPolicy({ mode: 'normal', maxRetries: this.retries }, 'synthetic') }
  override async resolveModel(provider: string, id: string) {
    return { provider, id, name: id, context: { contextWindow: this.contextWindow, maxOutputTokens: 4096 } }
  }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield { type: 'text-delta', index: 0, text: 'OK' }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 1, totalTokens: 11, cacheReadTokens: this.requests.length % 2 === 0 ? 8 : 0 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
async function fixture(adapter = new Adapter()) {
  const home = await mkdtemp(join(tmpdir(), 'nidofy-probe-')), ctx = new Context()
  await ctx.plugin(LlmRuntime)
  ctx.llm.registerAdapter(['synthetic', 'frozen'], adapter)
  const probe = new Probe(ctx, home)
  onTestFinished(async () => { await probe.close(); await ctx.fiber.dispose(); await rm(home, { recursive: true, force: true }) })
  return { home, ctx, probe, adapter }
}
const options = { provider: 'synthetic', model: 'model', inputTokens: 512, requests: 4, accepted: true }
it('prepares a fixed revision and sends precisely the consented request budget with redacted evidence', async () => {
  const { probe, adapter, ctx, home } = await fixture()
  ctx.on('nidofy/connection-route', () => 'frozen')
  await probe.start(options); await probe.settled()
  expect(probe.current).toMatchObject({ status: 'COMPLETED', conclusion: 'ADAPTER_REPORTED_CACHE_READ', budget: { inputTokens: 512, inputBytes: 2048, requests: 4, retries: 0 } })
  expect(adapter.requests).toHaveLength(4)
  expect(new Set(adapter.requests.map(r => r.provider))).toEqual(new Set(['frozen']))
  expect(adapter.requests[0]!.messages[0]!.content).toEqual(adapter.requests[1]!.messages[0]!.content)
  expect(adapter.requests[2]!.messages[0]!.content).not.toEqual(adapter.requests[0]!.messages[0]!.content)
  const saved = await readFile(join(home, 'last-probe.json'), 'utf8')
  expect(saved).not.toContain('synthetic'); expect(saved).not.toContain('0123456789abcdef')
})
it.each([new Adapter(1), new Adapter(0, 2048)])('refuses retries or insufficient context before any model request', async (adapter) => {
  const { probe } = await fixture(adapter)
  await probe.start(options); await probe.settled()
  expect(probe.current?.status).toBe('REFUSED'); expect(adapter.requests).toHaveLength(0)
})
it('requires explicit consent and does not schedule future work', async () => {
  const { probe, adapter } = await fixture()
  await expect(probe.start({ ...options, accepted: false })).rejects.toThrow('BUDGET')
  expect(adapter.requests).toHaveLength(0)
  expect(probe.current).toBeUndefined()
})
