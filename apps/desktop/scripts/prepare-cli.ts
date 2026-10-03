/** Package terminal launch scripts that reuse the installed Electron runtime. */

import { chmodSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolveDesktopDistribution } from './desktop-distribution.mjs'

/**
 * Copy the platform launcher into the application's public command directory.
 * @param destination - Physical runtime/cli directory prepared for the application.
 * @param platform - Target Desktop operating system.
 */
export function prepareDesktopCli(destination: string, platform: 'darwin' | 'win32'): void {
  const name = platform === 'win32' ? 'dsh.cmd' : 'dsh'
  const command = join(destination, 'bin', name)
  mkdirSync(join(destination, 'bin'), { recursive: true })
  const distribution = resolveDesktopDistribution(process.env)
  const launcher = readFileSync(join(import.meta.dirname, '..', 'cli', name), 'utf8')
  writeFileSync(command, distribution === undefined ? launcher : launcher.replaceAll('DeepSeek Harness', distribution.productName))
  if (platform === 'darwin') chmodSync(command, 0o755)
}
