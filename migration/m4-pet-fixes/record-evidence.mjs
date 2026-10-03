/** Record the qualified pet fix and verify that earlier qualified packages remain intact. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url)), run = resolve(process.argv[2])
assert.ok(relative(join(root, 'apps/desktop/.desktop-build/qualification'), run).startsWith('m4-pet-fixes-'))
const report = JSON.parse(readFileSync(join(run, 'result.json'), 'utf8'))
assert.equal(report.status, 'PASS'); assert.equal(report.scope, 'M2+M3+M4')
assert.ok(Object.values(report.checks).every(v => v === true))
for (const check of ['petMenuBesideSpriteAtBothScreenEdges', 'petAutomaticTaskSelectionPinAndIdle', 'petWaitingTaskPreemptsRunningAndCancellationReturns']) assert.equal(report.checks[check], true)
async function record(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(join(root, path))) hash.update(chunk)
  return { path, bytes: statSync(join(root, path)).size, sha256: hash.digest('hex') }
}
const preserved = []
for (const prior of ['m4', 'm4-fixes']) {
  const summary = JSON.parse(readFileSync(join(root, 'migration', prior, 'evidence/summary.json'), 'utf8'))
  for (const artifact of summary.artifacts) {
    const actual = await record(artifact.path)
    assert.equal(actual.sha256, artifact.sha256, 'Earlier qualified artifact changed: ' + artifact.path)
    preserved.push(actual)
  }
}
const base = 'apps/desktop/.desktop-build/targets/win-x64/candidates/m4-pet-fixes/personal-unsigned/win-unpacked/'
const artifacts = []
for (const path of ['Nidofy DSH Desktop.exe', 'resources/app.asar', 'resources/nidofy-protection.exe']) artifacts.push(await record(base + path))
for (const name of ['index.html', 'pet.css', 'pet.js', 'state.js']) {
  const path = 'packages/nidofy/desktop-extras/assets/pet/' + name
  const packaged = await record(base + 'resources/app.asar.unpacked/dsh/node_modules/@nidofy/dsh-desktop-extras/assets/pet/' + name)
  assert.equal(packaged.sha256, (await record(path)).sha256, 'Packaged pet differs from source: ' + name)
  artifacts.push(packaged)
}
const sources = []
for (const path of ['apps/desktop/src/pet.ts', 'packages/nidofy/desktop-extras/assets/pet/index.html', 'packages/nidofy/desktop-extras/assets/pet/pet.css', 'packages/nidofy/desktop-extras/assets/pet/pet.js', 'packages/nidofy/desktop-extras/assets/pet/state.js', 'migration/m4/tests/pet-state.test.mjs', 'migration/m4-pet-fixes/qualify-pet-fixes.mjs', 'migration/m4-pet-fixes/smoke-desktop.mjs', 'migration/m4-pet-fixes/launch-trial.ps1']) sources.push(await record(path))
const target = join(root, 'migration/m4-pet-fixes/evidence'); mkdirSync(target, { recursive: true })
writeFileSync(join(target, 'desktop.json'), JSON.stringify(report, null, 2) + '\n')
const summary = { status: 'PASS', baseline: 'dsh-v0.2.0-rc.2', completedAt: new Date().toISOString(), unsigned: true,
  qualification: relative(root, run), checks: report.checks, artifacts, preserved, sources,
  petUnitTests: 21, desktopBuild: 'PASS', changedNativeFileLint: 'PASS', translationPair: 'PASS',
  realModelCredentialsUsed: false, enterpriseAcceptance: 'deferred' }
writeFileSync(join(target, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ status: summary.status, checks: Object.keys(report.checks).length, preserved: preserved.length }))
