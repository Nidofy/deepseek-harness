/** Private Windows protocol launches retain the profile that initiated sign-in. */
import { isAbsolute } from 'node:path'

const ROOT_ARGUMENT = '--nidofy-desktop-data-root='

/**
 * Resolve the private profile before Electron acquires its per-userData lock.
 * @param argv - process arguments, including any registered protocol prefix.
 * @param environmentRoot - optional launcher override.
 * @returns explicit protocol root or the launcher override; rejects ambiguous or relative roots.
 */
export function distributionDataRoot(argv: readonly string[], environmentRoot?: string): string | undefined {
  const roots = argv.filter(value => value.startsWith(ROOT_ARGUMENT)).map(value => value.slice(ROOT_ARGUMENT.length))
  if (roots.length > 1) throw new Error('desktop distribution: duplicate data root arguments')
  const root = roots[0] ?? environmentRoot
  if (root !== undefined && !isAbsolute(root)) throw new Error('desktop distribution: data root must be absolute')
  return root
}

/** Electron protocol registration operations. */
export interface DesktopProtocolApplication {
  setAsDefaultProtocolClient(scheme: string, executable?: string, args?: string[]): boolean
}

/**
 * Register a wake-up URI; Windows Explorer does not inherit the trial launcher's environment.
 * @param application - the owning Electron application.
 * @param scheme - private scheme, or the official login completion scheme during personal sign-in.
 * @param root - resolved private data directory; undefined for the official distribution.
 * @param executable - current application executable.
 * @param platform - host platform.
 * @returns whether the OS accepted the registration.
 */
export function registerDesktopProtocol(application: DesktopProtocolApplication, scheme: string,
  root: string | undefined, executable: string, platform: NodeJS.Platform): boolean {
  return platform === 'win32' && root !== undefined
    ? application.setAsDefaultProtocolClient(scheme, executable, [`${ROOT_ARGUMENT}${root}`])
    : application.setAsDefaultProtocolClient(scheme)
}
