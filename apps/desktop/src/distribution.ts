/** Packaged distribution policy, independent of user profile and account state. */
import { isAbsolute, join, resolve } from 'node:path'

export interface DesktopDistribution {
  readonly schemaVersion: 1
  readonly kind: 'intranet' | 'personal'
  readonly revision: 1
  readonly productName: string
  readonly protocol: string
  readonly dataDirectory: string
  readonly updates: 'offline'
}

/** Unknown packaged policy fails before profile ownership or Host startup. */
export function readDesktopDistribution(value: unknown): DesktopDistribution | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('desktop distribution: invalid manifest')
  const kind: unknown = Reflect.get(value, 'kind')
  if (kind !== 'intranet' && kind !== 'personal') throw new Error('desktop distribution: unsupported kind')
  const expected: DesktopDistribution = { schemaVersion: 1, kind, revision: 1,
    productName: kind === 'personal' ? 'Nidofy DSH Desktop' : 'Nidofy DSH Intranet',
    protocol: kind === 'personal' ? 'nidofy-dsh' : 'nidofy-dsh-intranet',
    dataDirectory: kind === 'personal' ? 'Nidofy DSH Desktop' : 'Nidofy DSH Intranet', updates: 'offline' }
  if (Object.keys(value).length !== Object.keys(expected).length
    || Object.entries(expected).some(([key, item]) => Reflect.get(value, key) !== item)) {
    throw new Error('desktop distribution: unsupported policy')
  }
  return expected
}

/** The optional explicit root owns both Chromium state and Harness data; ambient DSH_HOME is ignored. */
export function distributionPaths(appData: string, override?: string, dataDirectory = 'Nidofy DSH Intranet'): { userData: string; home: string } {
  if (override !== undefined && !isAbsolute(override)) throw new Error('desktop distribution: data root must be absolute')
  const root = resolve(override ?? join(appData, dataDirectory))
  return { userData: join(root, 'electron'), home: join(root, 'harness') }
}

/** Chromium requests are local-only. This does not confine Node or tool subprocesses. */
export function permitsDistributionRequest(value: string, hostUrl?: string): boolean {
  try {
    const url = new URL(value)
    if (url.username || url.password) return false
    if (['dsh-app:', 'file:', 'data:', 'blob:', 'about:'].includes(url.protocol)) return true
    if (hostUrl === undefined || !['http:', 'ws:'].includes(url.protocol)) return false
    const host = new URL(hostUrl)
    return url.hostname === host.hostname && url.port === host.port
  } catch { return false }
}
