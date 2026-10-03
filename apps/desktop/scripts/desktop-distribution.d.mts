import type { DesktopDistribution } from '../src/distribution.ts'
/** Validate file-owned distribution settings; undefined selects upstream behavior. */
export function resolveDesktopDistribution(env: NodeJS.ProcessEnv): DesktopDistribution | undefined
