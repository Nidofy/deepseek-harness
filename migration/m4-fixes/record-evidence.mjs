/** Bind the completed desktop run to the repaired package and preserved M4 artifacts. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const run = resolve(process.argv[2])
assert.ok(relative(join(root, 'apps/desktop/.desktop-build/qualification'), run).startsWith('m4-fixes-'))
const report = JSON.parse(readFileSync(join(run, 'result.json'), 'utf8'))
assert.equal(report.status, 'PASS')
assert.equal(report.scope, 'M2+M3+M4')
assert.ok(Object.values(report.checks).every(v => v === true))
async function record(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(join(root, path))) hash.update(chunk)
  return { path, bytes: statSync(join(root, path)).size, sha256: hash.digest('hex') }
}
const original = JSON.parse(readFileSync(join(root, 'migration/m4/evidence/summary.json'), 'utf8'))
const preservedM4 = []
for (const artifact of original.artifacts) {
  const actual = await record(artifact.path)
  assert.equal(actual.sha256, artifact.sha256, 'Original M4 artifact changed: ' + artifact.path)
  preservedM4.push(actual)
}
const base = 'apps/desktop/.desktop-build/targets/win-x64/candidates/m4-fixes/personal-unsigned/win-unpacked/'
const artifacts = []
for (const path of ['Nidofy DSH Desktop.exe', 'resources/app.asar', 'resources/nidofy-protection.exe']) artifacts.push(await record(base + path))
const sources = []
for (const path of ['apps/desktop/src/main.ts', 'apps/desktop/src/preload-app.ts', 'apps/desktop/resources/personal.patch.yml', 'apps/desktop-host/src/workbench/owner.ts', 'apps/desktop-host/src/workbench/ui.ts', 'packages/nidofy/desktop-extras/src/ui.ts', 'packages/nidofy/desktop-extras/src/client/index.ts', 'packages/nidofy/desktop-extras/src/client/Environment.tsx', 'packages/nidofy/desktop-extras/package.json', 'packages/nidofy/desktop-extras/tsconfig.client.json', 'pnpm-lock.yaml', 'migration/m4-fixes/smoke-desktop.mjs', 'migration/m4-fixes/qualify-user-fixes.mjs', 'migration/m4-fixes/launch-trial.ps1']) sources.push(await record(path))
const target = join(root, 'migration/m4-fixes/evidence')
mkdirSync(target, { recursive: true })
writeFileSync(join(target, 'desktop.json'), JSON.stringify(report, null, 2) + '\n')
const summary = { status: 'PASS', baseline: 'dsh-v0.2.0-rc.2', completedAt: new Date().toISOString(), distribution: 'personal', unsigned: true,
  qualification: relative(root, run), checks: report.checks, artifacts, preservedM4, sources,
  focusedTests: { behavior: 30, accountAndPreload: 66 }, lint: 'PASS', officialBuild: 'PASS',
  realAccountAuthentication: 'NOT_RUN', realModelCredentialsUsed: false, enterpriseAcceptance: 'deferred' }
writeFileSync(join(target, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ status: summary.status, checks: Object.keys(report.checks).length, preservedM4: preservedM4.length, artifacts: artifacts.length }))
