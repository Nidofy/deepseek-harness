import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Script } from 'node:vm'
import { Context } from '@deepseek-ai/cordis'
import { PreferenceStore, defaults, defaultPet, migrateBudget, validate } from '../src/state.ts'
import { ScheduleImport, createRequest } from '../src/schedules.ts'
import { extrasHtml } from '../src/ui.ts'

const roots: string[] = []
it('bounds independent pet instances and preserves local state without accepting malformed positions or templates', () => {
  const value = { ...defaults(), companions: [defaultPet('2'), defaultPet('3')] }
  value.companions[0]!.bubble.templates.COMPLETED = '<literal> {state}'
  expect(validate(value).companions[0]!.bubble.templates.COMPLETED).toBe('<literal> {state}')
  expect(() => validate({ ...value, companions: [...value.companions, defaultPet('4')] })).toThrow('PET_INSTANCE_LIMIT')
  expect(() => validate({ ...value, companions: [defaultPet('1')] })).toThrow('INVALID_PET_ID')
  expect(() => validate({ ...value, pet: { ...value.pet, position: { x: Infinity, y: 0 } } })).toThrow('INVALID_PET_POSITION')
  expect(() => validate({ ...value, pet: { ...value.pet, bubble: { ...value.pet.bubble, templates: { unknown: 'text' } } } })).toThrow('INVALID_PET_TEMPLATE')
})
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))) })
async function fixture(): Promise<string> { const root = await mkdtemp(join(tmpdir(), 'nidofy-extras-')); roots.push(root); return root }

it('defaults optional modules off and serializes conflicting saves without losing a committed preference', async () => {
  const home = await fixture(), store = new PreferenceStore(home)
  await store.open()
  expect(store.value).toMatchObject({ diagnostics: false, cache: false, pets: false, vision: false })
  const [a, b] = await Promise.allSettled([store.save({ ...defaults(), diagnostics: true }), store.save({ ...defaults(), pets: true })])
  expect(a.status).toBe('fulfilled'); expect(b.status).toBe('rejected')
  const reopened = new PreferenceStore(home); await reopened.open()
  expect(reopened.value).toMatchObject({ revision: 1, diagnostics: true, pets: false })
})
it('preserves unknown preference schemas and refuses mutation', async () => {
  const home = await fixture(), bytes = '{"schemaVersion":99}'
  await writeFile(join(home, 'preferences.json'), bytes)
  const store = new PreferenceStore(home); await store.open()
  expect(store.warning).toBe('PREFERENCES_UNREADABLE')
  await expect(store.save(defaults())).rejects.toThrow('UNREADABLE')
  expect(await readFile(join(home, 'preferences.json'), 'utf8')).toBe(bytes)
})
it('retains legacy bytes as historical evidence and never treats them as tokens', () => {
  expect(migrateBudget({ schemaVersion: 1, budget: { inputBytes: 8192 } })).toMatchObject({ originalUnit: 'bytes', originalInputBytes: 8192, inputTokens: null, autoRun: false, status: 'REVIEW_REQUIRED' })
  expect(migrateBudget({ schemaVersion: 2, inputTokens: 2048 })).toMatchObject({ unit: 'estimated-tokens', inputTokens: 2048 })
  expect(() => migrateBudget({ schemaVersion: 3 })).toThrow('UNSUPPORTED')
})
it.each([false, true])('parses the localized interactive dashboard script (%s)', (zh) => {
  const html = extrasHtml(zh)
  expect(() => new Script(html.match(/<script>([\s\S]*?)<\/script>/)![1]!)).not.toThrow()
})
it('quarantines and deduplicates imported schedules without activating a scheduler', async () => {
  const home = await fixture(), source = join(home, 'source.json'), ctx = new Context()
  const bytes = JSON.stringify({ schemaVersion: 1, items: [{ id: 'old', title: 'Daily report', prompt: 'Read local report', kind: 'daily', timeZone: 'Asia/Shanghai', scheduledAt: '2000-01-01T00:00:00.000Z', apiKey: 'must-not-copy' }] })
  await writeFile(source, bytes)
  const store = new ScheduleImport(ctx, home)
  expect(await store.request('import', { path: source })).toMatchObject({ activated: 0, paused: [{ status: 'PAUSED' }] })
  await store.request('import', { path: source })
  const state = await store.request('list', {}) as { paused: unknown[] }
  expect(state.paused).toHaveLength(1)
  expect(await readFile(source, 'utf8')).toBe(bytes)
  expect(await readFile(join(home, 'paused-schedules.json'), 'utf8')).not.toContain('must-not-copy')
  await expect(store.request('restore', { accepted: true })).rejects.toThrow('ENABLE_OFFICIAL')
})
it('rejects overdue times, missing consent rules and ambiguous schedules', () => {
  expect(() => createRequest({ title: 't', prompt: 'p', at: '2000-01-01T00:00:00Z' })).toThrow('FUTURE')
  expect(() => createRequest({ title: 't', prompt: 'p', every_seconds: 10 })).toThrow('INTERVAL')
  expect(() => createRequest({ title: 't', prompt: 'p', every_seconds: 60, at: '2099-01-01T00:00:00Z' })).toThrow('RULE')
  expect(createRequest({ title: 't', prompt: 'p', weekly: { time: '17:00:00', time_zone: 'Asia/Shanghai', weekdays: [5] } })).toMatchObject({ weekly: { weekdays: [5] } })
})
