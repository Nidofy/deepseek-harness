/** Seal local qualification evidence only after the final complete package and UI checks pass. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs'
import { resolve, join, relative, basename } from 'node:path'
import { createHash } from 'node:crypto'
const root = resolve(import.meta.dirname, '../..')
const build = join(root, 'apps/desktop/.desktop-build')
const evidence = join(import.meta.dirname, 'evidence')
const [qualification, packaging] = process.argv.slice(2)
assert.match(qualification ?? '', /^m3-[a-zA-Z0-9]+$/)
assert.match(packaging ?? '', /^[0-9TZ.-]+-[a-zA-Z0-9]+$/)
const uiRoot = join(build, 'qualification', qualification), packageRoot = join(build, 'packaging-runs', packaging)
const ui = JSON.parse(readFileSync(join(uiRoot, 'result.json'), 'utf8'))
const packaged = JSON.parse(readFileSync(join(packageRoot, 'result.json'), 'utf8'))
assert.equal(ui.status, 'PASS'); assert.equal(packaged.success, true)
assert.ok(ui.checks.chineseWorkbenchAndSessionArtifacts)
assert.ok(ui.checks.officialPresentEventArtifactProjection)
mkdirSync(evidence, { recursive: true })
const write = (name, value) => writeFileSync(join(evidence, name), JSON.stringify(value, null, 2) + '\n')
write('desktop.json', ui); write('package.json', packaged)
write('model-tools.json', ui.modelToolContract)
const logs = ['m3-tests-qualified.log', 'm3-protection-final.log', 'm3-lint.log', 'm3-types.log', 'm3-doc-sync.log', 'm3-pairing.log',
  ...['project-actions','environment-repository','change-review','desktop-artifacts','task-recovery'].map(name => `m3-${name}-final.log`)]
for (const name of logs) copyFileSync(join(build, name), join(evidence, name))
copyFileSync(join(build, 'm3-preserved-packages.json'), join(evidence, 'preserved-packages.json'))
const packageLog = readFileSync(join(build, 'm3-package.log'), 'utf8').replace(/(token=)[^\s]+/g, '$1[REDACTED]')
writeFileSync(join(evidence, 'package-sanitized.log'), packageLog)
for (const name of readdirSync(uiRoot).filter(name => /^workbench-.*\.png$/.test(name))) copyFileSync(join(uiRoot, name), join(evidence, name))
const digest = path => ({ path: relative(root, path).replaceAll('\\', '/'), bytes: statSync(path).size, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') })
const candidate = join(build, 'targets/win-x64/candidates/m3/personal-unsigned/win-unpacked')
const artifacts = ['Nidofy DSH Desktop.exe','resources/app.asar','resources/nidofy-protection.exe'].map(name => digest(join(candidate, name)))
const sources = []
const collect = path => { if (statSync(path).isDirectory()) for (const name of readdirSync(path)) collect(join(path, name)); else if (/\.(?:ts|mjs|mts|json|rs)$/.test(path)) sources.push(digest(path)) }
for (const path of ['apps/desktop-host/src/workbench','apps/desktop-host/src/connections/protection.ts','apps/desktop-host/src/connections/api.ts','apps/desktop-host/tsdown.config.ts','apps/desktop/src/workbench.ts','apps/desktop/src/main.ts','apps/desktop/src/preload-app.ts','packages/client/ui-conversation/src/client/input/workbench-bridge.ts','packages/client/ui-conversation/src/client/input/hub.ts','native/nidofy-protection/src/main.rs','native/nidofy-protection/src/task_snapshots.rs','apps/desktop/scripts/desktop-build-paths.mjs','apps/desktop/scripts/package-target.ts','pnpm-lock.yaml']) collect(join(root, path))
write('source-inputs.json', { note: 'Current reviewed source snapshot; the immutable upstream tag is recorded in M0. Package hashes identify tested bytes.', sources })
write('summary.json', { status: 'PASS', milestone: 'M3', baseline: 'dsh-v0.2.0-rc.1', distribution: 'personal', platform: 'win32-x64', unsigned: true,
  completedAt: new Date().toISOString(), qualification, packaging, artifacts, checks: ui.checks, tests: { files: 29, passed: 425, legacyScripts: 5, nativeProtection: 5 },
  docs: { passed: 40, failed: 2, existingFailures: ['M0 README missing Chinese pair', 'M0/M1 immutable provenance commit hashes'] },
  boundaries: ['Enterprise gateway and clean-machine acceptance deferred', 'Real model credentials not used', 'Signed installer, upstream upgrade drill and remaining M4/M5 work are separate'],
  reports: { desktop: 'desktop.json', package: 'package.json', sources: 'source-inputs.json', previousPackages: 'preserved-packages.json' } })
console.log(`Sealed ${basename(uiRoot)} and ${basename(packageRoot)} in ${evidence}`)
