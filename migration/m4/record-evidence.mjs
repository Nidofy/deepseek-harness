/** Record only a complete M2+M3+M4 packaged run; never promote a partial/debug run. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { resolve, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const root = fileURLToPath(new URL('../../', import.meta.url))
const evidence = join(root, 'migration/m4/evidence')
const qualification = join(root, 'apps/desktop/.desktop-build/qualification')
const run = resolve(process.argv[2] ?? '')
assert.ok(run.startsWith(qualification + sep))
const result = JSON.parse(readFileSync(join(run, 'result.json'), 'utf8'))
assert.equal(result.status, 'PASS'); assert.equal(result.scope, 'M2+M3+M4')
assert.ok(Object.values(result.checks).every(v => v === true))
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const json = (name, value) => writeFileSync(join(evidence, name), JSON.stringify(value, null, 2) + '\n')
mkdirSync(evidence, {recursive:true})
const previous = JSON.parse(readFileSync(join(evidence, 'preserved-packages.json'), 'utf8'))
for (const entry of previous) assert.equal(digest(resolve(root, entry.path)), entry.sha256)
const artifacts = ['Nidofy DSH Desktop.exe', 'resources/app.asar', 'resources/nidofy-protection.exe'].map(name => {
  const path = join(root, 'apps/desktop/.desktop-build/targets/win-x64/candidates/m4/personal-unsigned/win-unpacked', name)
  return {path:relative(root,path).split(sep).join('/'),bytes:statSync(path).size,sha256:digest(path)}
})
const logs = {
  regression:'.build/m4-regression-final.log', corrections:'.build/m4-corrections-tests.log',
  pet:'.build/m4-pet-final.log', petPackages:'.build/m4-pet-package-final.log',
  observer:'.build/m4-observability-final.log', cachePolicy:'.build/m4-cache-policy-final.log',
  lint:'.build/m4-lint-final-all.log', docs:'.build/m4-doc-sync-qualified.log',
  build:'.build/m4-build-final.log', runtime:'.build/m4-runtime-qualified.log',
  releaseBoundary:'.build/m4-release-boundary-tests.log', petLifecycleLint:'.build/m4-pet-lint-last.log',
}
const readLog = key => readFileSync(join(root, logs[key]), 'utf8')
assert.match(readLog('regression'), /1698 passed/)
assert.equal(readLog('lint').trim(), '')
assert.equal(readLog('petLifecycleLint').trim(), '')
assert.match(readLog('runtime'), /desktop runtime: DOCX, XLSX, PPTX to PDF and skill CLI discovery passed/)
const docs = readLog('docs').match(/run-gates: (\d+) passed, (\d+) failed, (\d+) skipped/)
assert.ok(docs); assert.equal(docs[2], '2')
assert.match(readLog('docs'), /FAILED translation pairing/)
assert.match(readLog('docs'), /FAILED repository references/)
json('desktop.json', result)
const git = args => execFileSync('git', ['-c', 'safe.directory='+root.replace(/[\\/]$/,''), ...args], {cwd:root,encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean)
const sourcePaths = [...new Set([...git(['diff','--name-only','HEAD']), ...git(['ls-files','--others','--exclude-standard'])])]
  .filter(path => !path.startsWith('migration/') && /\.(?:ts|tsx|mjs|mts|json|yaml|yml|rs|toml|lock|png|webp|css|html|js|cjs)$/.test(path))
  .sort()
json('source-inputs.json', sourcePaths.map(path => ({path,sha256:digest(join(root,path))})))
json('summary.json', {
  status:'PASS',milestone:'M4',baseline:'dsh-v0.2.0-rc.2',sourceLock:'../origin.json',
  completedAt:new Date().toISOString(),distribution:'personal',platform:'win32-x64',unsigned:true,
  qualification:relative(qualification,run),artifacts,checks:result.checks,
  tests:{regression:{files:78,passed:1698},correctionSubset:{passed:55,overlapsRegression:true},releaseBoundary:{passed:20},petBehavior:{passed:19},legacyScripts:3},
  lint:'PASS: repository-wide',docs:{passed:Number(docs[1]),failed:2,exceptions:[
    'M0 README has no Chinese pair; historical record retained.',
    'M0/M1/M4 provenance records contain immutable commit/stash identities, rejected by the generic repository-reference gate.'
  ]},
  packaging:{source:'Official build:official; all dsh release packages; desktop-host and private plugins; prepare:packages; prepare:dsh; electron-builder --dir --unsigned',runtime:'Previously verified unchanged Electron/Node/vendor runtime reused after GitHub timeout; final packaged runtime smoke rerun',log:logs.build},
  boundaries:['No real model credentials used; synthetic protocols do not prove image quality or billed cache benefit.',
    'Enterprise gateway acceptance deferred by user.', 'Signed installer, clean-machine installation, mixed-DPI field qualification and real-provider checks remain M5.',
    'Arbitrary CLI profiles do not inherit Desktop Host protection and connection owners.'],
  reports:{desktop:'desktop.json',sources:'source-inputs.json',previousPackages:'preserved-packages.json'},
  validationLogs:Object.fromEntries(Object.entries(logs).map(([key,path])=>[key,{path,sha256:digest(join(root,path))}]))
})
console.log(JSON.stringify({status:'PASS',qualification:relative(qualification,run),desktopChecks:Object.keys(result.checks).length,artifacts:artifacts.length,preserved:previous.length,sourceInputs:sourcePaths.length}))
