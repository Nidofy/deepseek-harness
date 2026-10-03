import { createServer } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiAdapterOptions, PiAiPayloadScope } from '@deepseek-ai/dsh-llm-pi-ai'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { resolveProfiles } from '../src/config.ts'
import { memoryAuth } from './auth-double.ts'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'

afterEach(closeMockServers)
const request: GenerateOptions = { provider: 'payload-test', model: 'model-a', messages: [] }
const replaceKey = (key: string) => (payload: unknown): unknown => {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw Error('Expected payload object')
  return { ...payload, prompt_cache_key: key }
}
function adapter(baseURL: string, hooks: Partial<PiAiAdapterOptions> = {}): PiAiAdapter {
  const profiles = resolveProfiles({ 'payload-test': { api: 'openai-completions', baseURL, models: [{ id: 'model-a' }] } })
  return new PiAiAdapter({ profiles: () => profiles, auth: memoryAuth(), resolveApiKey: () => Promise.resolve('synthetic'), ...hooks })
}
async function drain(value: PiAiAdapter, options: GenerateOptions = request): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of value.stream(options)) chunks.push(chunk)
  return chunks
}

it('without a callback sends the same body and usage as an untouched payload callback', async () => {
  const server = await mockServer([{ events: textEvents }, { events: textEvents }])
  const plain = await drain(adapter(server.url))
  const tapped = await drain(adapter(server.url, { preparePayload: () => () => undefined }))
  expect(server.requests[1]).toEqual(server.requests[0])
  expect(tapped.filter(c => c.type === 'usage')).toEqual(plain.filter(c => c.type === 'usage'))
})

it('captures policy once before credentials and uses changed policy on the next request', async () => {
  const server = await mockServer([{ events: textEvents }, { events: textEvents }])
  const entered = Promise.withResolvers<undefined>()
  const credential = Promise.withResolvers<string>()
  let key = 'first'
  const scopes: PiAiPayloadScope[] = []
  const preparePayload = vi.fn((scope: PiAiPayloadScope) => { scopes.push(scope); return replaceKey(key) })
  const value = adapter(server.url, { preparePayload, resolveApiKey: () => { entered.resolve(undefined); return credential.promise } })
  const pending = drain(value)
  await entered.promise
  key = 'second'
  expect(server.requests).toHaveLength(0)
  credential.resolve('synthetic')
  await pending
  await drain(value)
  expect(preparePayload).toHaveBeenCalledTimes(2)
  expect(scopes[0]).toEqual({ provider: 'payload-test', model: 'model-a', api: 'openai-completions', baseURL: server.url, sessionId: undefined })
  expect(Object.isFrozen(scopes[0])).toBe(true)
  expect(server.requests[0]).toMatchObject({ prompt_cache_key: 'first' })
  expect(server.requests[1]).toMatchObject({ prompt_cache_key: 'second' })
})

it('does not resolve credentials or send a request when policy preparation fails', async () => {
  const server = await mockServer([])
  const resolveApiKey = vi.fn(() => Promise.resolve('synthetic'))
  await expect(drain(adapter(server.url, { resolveApiKey, preparePayload: () => { throw Error('policy failed') } }))).rejects.toThrow('policy failed')
  expect(resolveApiKey).not.toHaveBeenCalled()
  expect(server.requests).toHaveLength(0)
})

it('does not send a request when the payload transform fails', async () => {
  const server = await mockServer([])
  const chunks = await drain(adapter(server.url, { preparePayload: () => () => { throw Error('payload failed') } }))
  expect(chunks.find(chunk => chunk.type === 'finish')).toMatchObject({ reason: { kind: 'error' } })
  expect(server.requests).toHaveLength(0)
})

it('preserves cancellation while the credential is pending', async () => {
  const server = await mockServer([])
  const entered = Promise.withResolvers<undefined>(), credential = Promise.withResolvers<string>()
  const controller = new AbortController()
  const value = adapter(server.url, { preparePayload: () => replaceKey('cancelled'), resolveApiKey: () => { entered.resolve(undefined); return credential.promise } })
  const pending = drain(value, { ...request, signal: controller.signal })
  await entered.promise
  controller.abort()
  credential.resolve('synthetic')
  // Direct adapters may throw or emit aborted; either must leave the wire untouched.
  try { await pending } catch (error) { expect(error).toBeInstanceOf(Error) }
  expect(server.requests).toHaveLength(0)
})

it('keeps Anthropic final requests and usage unchanged when policy declines that protocol', async () => {
  const requests: unknown[] = []
  const events = [
    { type: 'message_start', message: { id: 'synthetic', type: 'message', role: 'assistant', model: 'model-a', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 3, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hello' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } },
    { type: 'message_stop' },
  ]
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => {
      requests.push(JSON.parse(body))
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''))
    })
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  try {
    const address = server.address()
    if (address === null || typeof address === 'string') throw Error('No server address')
    const profiles = resolveProfiles({ 'payload-test': { api: 'anthropic-messages', baseURL: `http://127.0.0.1:${address.port}`, models: [{ id: 'model-a' }] } })
    const preparePayload = vi.fn((scope: PiAiPayloadScope) => scope.api === 'openai-completions' ? replaceKey('openai-only') : undefined)
    const config = { profiles: () => profiles, auth: memoryAuth(), resolveApiKey: () => Promise.resolve('synthetic') }
    const native = await drain(new PiAiAdapter(config))
    const scoped = await drain(new PiAiAdapter({ ...config, preparePayload }))
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
    expect(requests[1]).not.toHaveProperty('prompt_cache_key')
    expect(preparePayload).toHaveBeenCalledTimes(1)
    expect(scoped.filter(c => c.type === 'usage')).toEqual(native.filter(c => c.type === 'usage'))
    expect(scoped).toContainEqual(expect.objectContaining({ type: 'finish', reason: { kind: 'stop' } }))
  } finally {
    server.closeAllConnections()
    await new Promise<void>((done, reject) => server.close((error) => { if (error) reject(error); else done() }))
  }
})
