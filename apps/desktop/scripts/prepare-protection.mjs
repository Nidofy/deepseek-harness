/** Build the derived Windows snapshot helper from the locked Rust dependency set. */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32') throw Error('Protection helper requires a Windows build host')
const installed = join(homedir(), '.cargo', 'bin', 'cargo.exe')
const cargo = process.env.CARGO ?? (existsSync(installed) ? installed : 'cargo')
const manifest = fileURLToPath(new URL('../../../native/nidofy-protection/Cargo.toml', import.meta.url))
const result = spawnSync(cargo, ['build', '--release', '--locked', '--manifest-path', manifest], {
  windowsHide: true, stdio: 'inherit', env: process.env,
})
if (result.error) throw result.error
if (result.status !== 0) throw Error('Native protection build failed')
