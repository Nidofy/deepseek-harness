/** M0 wire observations for credentials retained by prepared pi-ai requests. */
import { afterEach, expect, it } from 'vitest'
import { BlockAssembler, type PreparedAdapterCall } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { resolveProfiles } from '../../../packages/llm/llm-pi-ai/src/config.ts'
import { memoryAuth } from '../../../packages/llm/llm-pi-ai/tests/auth-double.ts'
import { closeMockServers, mockServer, textEvents } from '../../../packages/llm/llm-pi-ai/tests/mock-server.ts'

afterEach(closeMockServers)

async function consume(call: PreparedAdapterCall): Promise<void> {
  const assembler = new BlockAssembler()
  for await (const chunk of call.stream({ provider: 'deepseek', model: 'deepseek-v4-flash', messages: [] })) {
    assembler.push(chunk)
  }
  expect(assembler.finish.kind).toBe('stop')
}

it('re-reads a mutable credential even when dispatch reuses a prepared model generation', async () => {
  const server = await mockServer([{ events: textEvents }, { events: textEvents }])
  const profiles = resolveProfiles({ deepseek: { baseURL: server.url, apiKeyEnv: 'M0_MUTABLE' } })
  let credential = 'synthetic-m0-a'
  const adapter = new PiAiAdapter({ profiles: () => profiles, resolveApiKey: async () => credential, auth: memoryAuth() })
  const prepared = await adapter.prepareCall('deepseek', 'deepseek-v4-flash')
  await consume(prepared)
  credential = 'synthetic-m0-b'
  await consume(prepared)
  expect(server.headers.map(headers => headers.authorization)).toEqual(['Bearer synthetic-m0-a', 'Bearer synthetic-m0-b'])
})

it('retains a revision credential and endpoint for repeated dispatch while new calls select the next revision', async () => {
  const first = await mockServer([{ events: textEvents }, { events: textEvents }])
  const second = await mockServer([{ events: textEvents }])
  const credentials = new Map([['M0_REV_1', 'synthetic-m0-a'], ['M0_REV_2', 'synthetic-m0-b']])
  let profiles = resolveProfiles({ deepseek: { baseURL: first.url, apiKeyEnv: 'M0_REV_1' } })
  const adapter = new PiAiAdapter({
    profiles: () => profiles,
    resolveApiKey: async (_provider, profile) => {
      const key = profile.apiKeyEnv === undefined ? undefined : credentials.get(profile.apiKeyEnv)
      if (key === undefined) throw new Error('M0 revision is unavailable')
      return key
    },
    auth: memoryAuth(),
  })
  const retained = await adapter.prepareCall('deepseek', 'deepseek-v4-flash')
  await consume(retained)
  profiles = resolveProfiles({ deepseek: { baseURL: second.url, apiKeyEnv: 'M0_REV_2' } })
  await consume(retained)
  await consume(await adapter.prepareCall('deepseek', 'deepseek-v4-flash'))
  expect(first.headers.map(headers => headers.authorization)).toEqual(['Bearer synthetic-m0-a', 'Bearer synthetic-m0-a'])
  expect(second.headers.map(headers => headers.authorization)).toEqual(['Bearer synthetic-m0-b'])
  expect(first.requests).toHaveLength(2)
  expect(second.requests).toHaveLength(1)
})
