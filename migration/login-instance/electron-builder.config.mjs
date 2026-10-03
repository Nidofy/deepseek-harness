/** Shell-only qualification reuses the qualified Notebook runtime without rebuilding the engine. */
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createElectronBuilderConfig } from '../../apps/desktop/scripts/electron-builder-config.mjs'
const source = fileURLToPath(new URL('../../apps/desktop/.desktop-build/targets/win-x64/candidates/n-context/', import.meta.url))
const config = createElectronBuilderConfig(process.env, 'win32', 'x64', join(source, 'dsh'))
config.electronDist = join(source, 'electron')
config.extraResources.find(resource => resource.to === 'runtime').from = join(source, 'runtime')
export default config
