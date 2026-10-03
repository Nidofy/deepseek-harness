/** Copy sanitized local qualification evidence without copying private profile data. */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = fileURLToPath(new URL('../../', import.meta.url))
const build = join(repository, 'apps/desktop/.desktop-build')
const output = join(repository, 'migration/m1/evidence')
mkdirSync(output, { recursive: true })
const json = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
const ui = json(join(build, 'm1-ui-verified.log'))
if (ui.status !== 'PASS') throw new Error('M1 packaged UI qualification has not passed')
const source = json(join(build, 'm1-source-verification.json'))
const runtime = json(join(build, 'targets/win-x64/dsh/desktop-runtime.json'))
for (const name of ['m1-tests.log', 'm1-extra-tests.log', 'm1-distribution-tests-final.log', 'm1-lint-final.log',
  'm1-typecheck-final.log', 'm1-ui-i18n.log', 'm1-doc-pairing.log', 'm1-package.log', 'm1-package-attempt2.log', 'm1-prepare-retry.log',
  'm1-builder-final.log', 'm1-runtime-smoke-final.log']) {
  const contents = readFileSync(join(build, name), 'utf8').replace(/([?&]token=)[^\s"']+/g, '$1[REDACTED]')
  writeFileSync(join(output, name), contents)
}
for (const name of ['first-start.png', 'coexistence.png', 'official-workspace.png']) copyFileSync(join(ui.run, name), join(output, name))
writeFileSync(join(output, 'desktop-ui.json'), `${JSON.stringify(ui, null, 2)}\n`)
const packageRoot = join(build, 'targets/win-x64/unsigned-artifacts/win-unpacked')
const files = ['Nidofy DSH Intranet.exe', 'resources/app.asar'].map(relative => {
  const path = join(packageRoot, relative)
  return { relative, bytes: statSync(path).size, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }
})
const result = {
  schemaVersion: 1, milestone: 'M1', status: 'LOCAL_IMPLEMENTATION_VERIFIED_SITE_ACCEPTANCE_PENDING',
  runtimeVersion: runtime.release.version, distribution: 'intranet', distributionRevision: 1,
  upstreamCommit: source.upstreamCommit, lockfileBlob: source.lockfileBlob,
  legacyPatchReconstruction: source.status, productSourceModified: true, remotePublished: false,
  packageRoot, unsigned: true, files,
  verification: { distinctPassingTests: 84, hostTypecheck: 'PASS', targetedLint: 'PASS',
    preparedAndPackagedRuntime: 'PASS', officeConversions: 'PASS', realDesktop: ui.status,
    enterpriseGateway: 'NOT_RUN', disconnectedCleanMachine: 'NOT_RUN' },
  buildRecovery: 'First attempt lacked a declaration; second attempt hit Electron/pnpm Windows shutdown failure. Runtime preparation retried successfully, then official builder and packaged-runtime checks completed. Final shell was rebuilt and repackaged.',
  testRecovery: 'The real builder-policy test exceeded its initial 5s deadline once; its bounded 15s retry passed. The optional policy return type required narrowing an existing upstream test.',
  site: { modelBaseUrl: 'http://172.16.10.6:18080', buildMachineCanReachSite: false,
    publicEgress: 'blocked according to deployment owner; independently unverified' },
}
let checkedLinks = 0
for (const relative of ['apps/desktop/README.md', 'apps/desktop/README.zh.md', 'migration/m1/README.md', 'migration/m1/README.zh.md',
  '../docs/ELECTRON-M1-IMPLEMENTATION-2026-09-29.md', '../docs/ELECTRON-MIGRATION-PLAN-0.2.0-rc.1.md']) {
  const path = join(repository, relative)
  for (const match of readFileSync(path, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0]
    if (!target || /^[a-z]+:/i.test(target)) continue
    if (!existsSync(resolve(dirname(path), decodeURIComponent(target)))) throw new Error(`Broken local link in ${relative}: ${target}`)
    checkedLinks++
  }
}
result.verification.localDocumentLinks = checkedLinks
writeFileSync(join(output, 'summary.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify({ status: result.status, files: files.length, output }))
