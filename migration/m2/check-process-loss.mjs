/** Kill the actual owner after each publication stage, then reconcile in a new process. */
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve('apps/desktop/.desktop-build/qualification')
mkdirSync(root, { recursive: true })
const directory = mkdtempSync(join(root, 'm2-process-loss-'))
const child = fileURLToPath(new URL('./connection-crash-child.mjs', import.meta.url))
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|TOKEN|PASSWORD|SECRET|^DSH_|^OPENAI|^ANTHROPIC/i.test(key)))
const result = []
function spawn(point, home, operationId) {
  const process = fork(child, [home, point, operationId], { execArgv: ['--import', 'tsx/esm'], env: environment,
    windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
  process.stderr.on('data', () => {})
  return process
}
async function message(process) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { process.kill(); reject(Error('Child qualification timed out')) }, 15000)
    process.once('message', value => { clearTimeout(timer); resolve(value) })
    process.once('error', error => { clearTimeout(timer); reject(error) })
    process.once('exit', code => { clearTimeout(timer); reject(Error(`Child exited before observation: ${code}`)) })
  })
}
for (const point of ['prepared', 'credential-staged', 'committed', 'applied']) {
  const home = join(directory, point), operationId = randomUUID()
  const owner = spawn(point, home, operationId)
  assert.equal((await message(owner)).point, point)
  const exited = once(owner, 'exit'); owner.kill('SIGKILL'); await exited
  const restarted = spawn('inspect', home, operationId), exit = once(restarted, 'exit')
  const observation = await message(restarted); await exit
  const committed = ['committed', 'applied'].includes(point)
  assert.equal(observation.status.committed, committed)
  assert.equal(observation.status.desiredRevision, committed ? 1 : 0)
  assert.equal(observation.status.appliedRevision, observation.status.desiredRevision)
  assert.equal(observation.credentials, committed ? 1 : 0)
  result.push({ point, killed: true, reconciled: true, committed })
}
writeFileSync(join(directory, 'result.json'), JSON.stringify({ status: 'PASS', result }, null, 2))
console.log(JSON.stringify({ status: 'PASS', directory, result }, null, 2))
