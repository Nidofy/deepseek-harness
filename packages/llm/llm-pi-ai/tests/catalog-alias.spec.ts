/** Catalog inheritance preserves model capabilities without merging route identity. */
import { afterEach, expect, it } from 'vitest'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiPayloadScope } from '@deepseek-ai/dsh-llm-pi-ai'
import { Config, resolveProfiles } from '../src/config.ts'
import { PiAiCatalogError } from '../src/catalog.ts'
import { memoryAuth } from './auth-double.ts'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'

afterEach(closeMockServers)
const catalogModel = resolveProfiles({ deepseek: {} }).get('deepseek')!.piProvider!.getModels()[0]!.id

it.each(['zai-coding-cn', 'anthropic', 'deepseek'])('inherits every installed %s model field under an independent route', (provider) => {
  const original = resolveProfiles({ [provider]: {} }).get(provider)!.piProvider!.getModels()
  const alias = resolveProfiles({ independent: { catalogProvider: provider } }).get('independent')!.piProvider!
  expect(alias.id).toBe('independent')
  expect(alias.getModels()).toEqual(original.map(model => ({ ...model, provider: 'independent' })))
  expect(alias.getModels().some(model => model.reasoning)).toBe(true)
})

it('keeps explicit endpoint, model and protocol overrides above inherited defaults', () => {
  const profile = resolveProfiles({ alias: {
    catalogProvider: 'deepseek', api: 'anthropic-messages', baseURL: 'http://127.0.0.1:9',
    models: [{ id: catalogModel, contextWindow: 8192, reasoningEfforts: false }],
  } }).get('alias')!
  expect(profile.piProvider!.getModels()).toEqual([expect.objectContaining({
    id: catalogModel, provider: 'alias', api: 'anthropic-messages',
    baseUrl: 'http://127.0.0.1:9', contextWindow: 8192, reasoning: false,
  })])
  const customized = resolveProfiles({ alias: {
    catalogProvider: 'deepseek', modelOverrides: { [catalogModel]: { contextWindow: 8192 } },
  } }).get('alias')!
  expect(customized.piProvider!.getModels().find(model => model.id === catalogModel)!.contextWindow).toBe(8192)
})

it('rejects empty or missing explicit catalog sources even with complete custom models', () => {
  expect(() => Config({ providers: { alias: { catalogProvider: '' } } })).toThrow()
  expect(() => resolveProfiles({ alias: { catalogProvider: '' } })).toThrow('empty catalogProvider')
  const declaration = { api: 'openai-completions', baseURL: 'http://127.0.0.1:9', models: [{ id: 'custom' }] }
  expect(() => resolveProfiles({ alias: { ...declaration, catalogProvider: 'missing-catalog' } })).toThrow(PiAiCatalogError)
  const deferred = resolveProfiles({ alias: { ...declaration, catalogProvider: 'missing-catalog' } }, 'deferred').get('alias')!
  expect(deferred.piProvider).toBeUndefined()
  expect(deferred.catalogError).toContain('missing-catalog')
  expect(resolveProfiles({ alias: declaration }).get('alias')!.piProvider!.getModels()[0]!.id).toBe('custom')
})

it('isolates credentials, endpoints and payload scope while a previous request waits for credentials', async () => {
  const first = await mockServer([{ events: textEvents }])
  const second = await mockServer([{ events: textEvents }, { events: textEvents }])
  const resolve = (url: string, key: string) => resolveProfiles({
    alpha: { catalogProvider: 'deepseek', baseURL: url, apiKeyEnv: key },
    beta: { catalogProvider: 'deepseek', baseURL: second.url, apiKeyEnv: 'BETA' },
  })
  let profiles = resolve(first.url, 'ALPHA_OLD')
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const scopes: PiAiPayloadScope[] = []
  const value = new PiAiAdapter({
    profiles: () => profiles, auth: memoryAuth(),
    resolveApiKey: async (_provider, profile) => {
      if (profile.apiKeyEnv === 'ALPHA_OLD') { entered.resolve(undefined); await release.promise }
      return `synthetic-${profile.apiKeyEnv}`
    },
    preparePayload: (scope) => { scopes.push(scope); return undefined },
  })
  const drain = async (provider: string) => {
    const chunks = []
    for await (const chunk of value.stream({ provider, model: catalogModel, messages: [] })) chunks.push(chunk)
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'finish', reason: { kind: 'stop' } }))
  }
  const pending = drain('alpha')
  try {
    await entered.promise
    profiles = resolve(second.url, 'ALPHA_NEW')
    await drain('beta')
  } finally { release.resolve(undefined) }
  await pending
  await drain('alpha')
  expect(first.headers.map(header => header.authorization)).toEqual(['Bearer synthetic-ALPHA_OLD'])
  expect(second.headers.map(header => header.authorization)).toEqual(['Bearer synthetic-BETA', 'Bearer synthetic-ALPHA_NEW'])
  expect(scopes.map(scope => [scope.provider, scope.baseURL])).toEqual([
    ['alpha', first.url], ['beta', second.url], ['alpha', second.url],
  ])
  expect(first.requests[0]).toMatchObject({ model: catalogModel })
})
