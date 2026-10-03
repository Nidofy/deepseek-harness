/** Desktop CLI profile operations share the derived application's isolated home. */
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'

export async function prepareCliDistribution(runtimeDir: string, environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  let metadata: unknown
  try { metadata = JSON.parse(await readFile(join(dirname(runtimeDir), 'package.json'), 'utf8')) as unknown }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
  if (!metadata || typeof metadata !== 'object' || !('dshDistribution' in metadata)) return
  const value = metadata.dshDistribution
  if (!value || typeof value !== 'object' || !('kind' in value) || !['personal', 'intranet'].includes(String(value.kind))) throw Error('DESKTOP_DISTRIBUTION_INVALID')
  const directory = value.kind === 'personal' ? 'Nidofy DSH Desktop' : 'Nidofy DSH Intranet'
  const override = environment.NIDOFY_DESKTOP_DATA_ROOT
  if (override !== undefined && !isAbsolute(override)) throw Error('DESKTOP_DATA_ROOT_INVALID')
  const appData = process.platform === 'win32' ? environment.APPDATA : process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support') : environment.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  if (!appData && override === undefined) throw Error('DESKTOP_DATA_ROOT_UNAVAILABLE')
  const root = override ?? (appData === undefined ? undefined : join(appData, directory))
  if (root === undefined) throw Error('DESKTOP_DATA_ROOT_UNAVAILABLE')
  environment.DSH_HOME = join(resolve(root), 'harness')
}
