/** Resume the failed runtime materialization using its already-built package set, then repeat all runtime/package checks. */
import { resolve, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadDesktopPackageEnvironment } from '../../apps/desktop/scripts/desktop-package-environment.mjs'
import { desktopElectronBuilderArguments, desktopElectronBuilderEnvironment, resolveDesktopPackageTarget,
  withoutDesktopUploadCredentials, withoutWindowsSigningEnvironment } from '../../apps/desktop/scripts/package-target.ts'
import { createPackagingRun, recordPackagingEvent } from '../../apps/desktop/scripts/packaging-run.mjs'
import { desktopBuildCommitEnvironment, readDesktopBuildCommit } from '../../apps/desktop/scripts/desktop-build-commit.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url)), app = join(root, 'apps/desktop')
const previous = resolve(process.argv[2])
const prior = JSON.parse(readFileSync(join(previous, 'run.json'), 'utf8'))
if (prior.target !== 'win-x64' || !prior.unsigned || !prior.directory) throw Error('Expected an unsigned Windows directory qualification')
const result = JSON.parse(readFileSync(join(previous, 'result.json'), 'utf8'))
if (result.success || !result.stages.some(stage => stage.stage === 'run prepare:dsh' && stage.code !== 0)) throw Error('Expected runtime materialization failure')
const commit = readDesktopBuildCommit(root)
if (commit.commit !== prior.commit) throw Error('Source baseline changed')
const environment = {
  ...withoutWindowsSigningEnvironment(withoutDesktopUploadCredentials(loadDesktopPackageEnvironment('win32'))),
  ...desktopBuildCommitEnvironment(commit), DSH_DESKTOP_BUILD_VERSION: prior.version,
  DSH_DESKTOP_TARGET_PLATFORM: 'win32', DSH_DESKTOP_TARGET_ARCH: 'x64',
}
const run = createPackagingRun(join(app, '.desktop-build/packaging-runs'), {
  target: 'win-x64', unsigned: true, directory: true, version: prior.version,
  commit: commit.commit, dirty: commit.dirty, resumedFrom: previous,
})
environment.DSH_DESKTOP_PACKAGING_RUN_DIR = run.directory
const pnpm = join(root, 'node_modules/.pnpm/pnpm@11.7.0/node_modules/pnpm/bin/pnpm.mjs')
const execute = (args, env = environment) => run.run(args.join(' '), process.execPath, [pnpm, ...args], { cwd: app, env })
let success = false
console.log(`DESKTOP_PACKAGING_RECORD ${run.directory}`)
try {
  await execute(['run', 'prepare:dsh'])
  await execute(desktopElectronBuilderArguments(resolveDesktopPackageTarget('win-x64'), true), desktopElectronBuilderEnvironment(environment, true))
  await execute(['exec', 'tsx', 'scripts/smoke-packaged-runtime.ts', '--unsigned'])
  recordPackagingEvent(run.directory, { type: 'artifacts', directory: join(app, '.desktop-build/targets/win-x64/personal-unsigned') })
  success = true
} finally { run.finish(success) }
