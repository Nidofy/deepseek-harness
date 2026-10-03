import { expect, it } from 'vitest'
import { desktopTargetBuildPaths, resolveDesktopTargetBuildPaths } from '../scripts/desktop-build-paths.mjs'

it('isolates candidate mutable files while retaining the immutable download cache', () => {
  const current = desktopTargetBuildPaths('win-x64', 'personal')
  const candidate = desktopTargetBuildPaths('win-x64', 'personal', 'm3')
  expect(candidate.root).not.toBe(current.root)
  expect(candidate.unsignedArtifacts).toContain('m3')
  expect(candidate.runtime).not.toBe(current.runtime)
  expect(candidate.downloads).toBe(current.downloads)
  expect(resolveDesktopTargetBuildPaths({ DSH_DESKTOP_DISTRIBUTION:'personal',DSH_DESKTOP_BUILD_CANDIDATE:'m3' },'win32','x64')).toEqual(candidate)
  for (const value of ['../outside','C:/outside','m3/next','']) expect(() => desktopTargetBuildPaths('win-x64','personal',value)).toThrow('candidate')
})
