/** Disposable child for real process-loss qualification; only synthetic credentials enter its private directory. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ConnectionStore } from '../../apps/desktop-host/src/connections/store.ts'

const [directory, point, operationId] = process.argv.slice(2)
await mkdir(directory, { recursive: true })
const file = join(directory, 'test-secrets.json')
let values = {}
try { values = JSON.parse(await readFile(file, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
const secrets = {
  get: async ref => values[ref],
  set: async (ref, value) => { values[ref] = value; await writeFile(file, JSON.stringify(values)) },
  unset: async ref => { delete values[ref]; await writeFile(file, JSON.stringify(values)) },
}
const store = new ConnectionStore(directory, secrets, () => {}, 0, async at => {
  if (at !== point) return
  process.send({ point: at })
  await new Promise(() => {})
})
await store.open()
if (point === 'inspect') {
  process.send({ status: await store.inspect(operationId), credentials: Object.keys(values).length })
  await store.close(); process.disconnect()
} else {
  await store.mutate({ action: 'save', operationId, expectedRevision: 0, connection: 'crash-test', key: 'synthetic-crash-key',
    profile: { api: 'openai-completions', baseURL: 'http://127.0.0.1:1/v1', models: [{ id: 'same' }] } })
  throw Error('Expected parent termination')
}
