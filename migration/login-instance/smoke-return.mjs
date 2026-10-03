import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron } from '../../node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const build = join(repo, 'apps/desktop/.desktop-build')
const executablePath = join(build, 'targets/win-x64/candidates/n-login/personal-unsigned/win-unpacked/Nidofy DSH Desktop.exe')
const run = mkdtempSync(join(build, 'qualification/login-return-'))
const root = join(run, 'trial profile 中文')
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|TOKEN|PASSWORD|SECRET|^DSH_|^DEEPSEEK|^ANTHROPIC|^OPENAI|^GOOGLE|^ELECTRON_RUN_AS_NODE|^NIDOFY_/i.test(key)))
env.NO_PROXY = 'localhost,127.0.0.1,::1'
const key = scheme => `HKCU\\Software\\Classes\\${scheme}`
const reg = (...args) => spawnSync('reg.exe', args, { windowsHide: true, encoding: 'utf8' })
const registeredCommand = scheme => {
  const exported = join(run, `${scheme}-current.reg`)
  if (reg('export', key(scheme), exported, '/y').status !== 0) return ''
  const section = readFileSync(exported, 'utf16le').split(`[HKEY_CURRENT_USER\\Software\\Classes\\${scheme}\\shell\\open\\command]`)[1]
  const value = section?.match(/@="(.*)"/)?.[1]
  return value?.replace(/\\([\\"])/g, '$1') ?? ''
}
const saved = new Map(['nidofy-dsh', 'dsh'].map(scheme => [scheme, reg('export', key(scheme), join(run, `${scheme}-before.reg`), '/y').status === 0]))
let application
const result = { status: 'FAIL', run, checks: {} }
const until = async (test, label) => { for (let i = 0; i < 160; i++) { if (await test()) return; await delay(200) } throw Error(`Timeout: ${label}`) }
const ready = async () => {
  const page = await application.firstWindow()
  await page.waitForURL('dsh-app://app/**', { timeout: 90000 })
  await page.waitForFunction(() => document.body.innerText.includes('New Session') && !document.body.innerText.includes('Loading plugins'), undefined, { timeout: 90000 })
  return page
}
const identity = () => application.evaluate(({ app, BrowserWindow }) => ({ pid: process.pid, root: app.getPath('userData'), windows: BrowserWindow.getAllWindows().map(window => window.id), home: process.env.DSH_HOME }))
try {
  application = await _electron.launch({ executablePath, env: { ...env, NIDOFY_DESKTOP_DATA_ROOT: root }, timeout: 90000 })
  await ready()
  const before = await identity()
  assert.equal(before.root, join(root, 'electron'))
  const command = registeredCommand('nidofy-dsh')
  const args = [...command.matchAll(/"([^"]*)"/g)].map(match => match[1])
  assert.deepEqual(args, [executablePath, `--nidofy-desktop-data-root=${root}`, '%1'])
  result.checks.registration_preserves_trial_root_and_spaces = true
  await application.evaluate(({ app }) => {
    globalThis.__returnCount = 0
    app.on('second-instance', () => { globalThis.__returnCount++ })
  })
  for (const [name, childEnv] of [['no_launcher_environment', env], ['conflicting_launcher_environment', { ...env, NIDOFY_DESKTOP_DATA_ROOT: join(run, 'wrong-profile') }]]) {
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize())
    const count = await application.evaluate(() => globalThis.__returnCount)
    const child = spawn(args[0], [...args.slice(1, -1), 'dsh://open'], { env: childEnv, windowsHide: true, stdio: 'ignore' })
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(Error('Second launch failed to exit')) }, 30000)
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error(`Second launch exit ${code}`)) })
    })
    await until(async () => await application.evaluate(() => globalThis.__returnCount) === count + 1, name)
    assert.deepEqual(await identity(), before)
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()), false)
    result.checks[name] = true
  }
  const count = await application.evaluate(() => globalThis.__returnCount)
  await application.evaluate(({ shell }) => shell.openExternal('nidofy-dsh://open'))
  await until(async () => await application.evaluate(() => globalThis.__returnCount) === count + 1, 'Windows protocol activation')
  assert.deepEqual(await identity(), before)
  result.checks.actual_windows_protocol_reuses_owner = true
  // The main-entry unit test verifies sign-in registers these same arguments before browser opening.
  await application.evaluate(({ app }, prefix) => {
    if (!app.setAsDefaultProtocolClient('dsh', process.execPath, prefix)) throw Error('Login protocol registration failed')
  }, args.slice(1, -1))
  const loginCount = await application.evaluate(() => globalThis.__returnCount)
  await application.evaluate(({ shell }) => shell.openExternal('dsh://open'))
  await until(async () => await application.evaluate(() => globalThis.__returnCount) === loginCount + 1, 'Official login completion activation')
  assert.deepEqual(await identity(), before)
  result.checks.official_login_scheme_reuses_owner = true
  await application.close(); application = undefined
  application = await _electron.launch({ executablePath, args: [...args.slice(1, -1), 'dsh://open'], env, timeout: 90000 })
  const page = await ready()
  const cold = await identity()
  assert.equal(cold.root, before.root)
  assert.equal(cold.home, before.home)
  await page.screenshot({ path: join(run, 'returned-workspace.png') })
  result.checks.cold_protocol_launch_retains_profile = true
  result.status = 'PASS'
} catch (error) {
  result.error = String(error).replace(/token=[^\s&]+/g, 'token=[redacted]')
  process.exitCode = 1
} finally {
  if (application) await application.close()
  // Restore only this test's registration; preserve a different application registered meanwhile.
  for (const [scheme, existed] of saved) {
    const current = registeredCommand(scheme)
    if (current.includes(executablePath) && current.includes(root)) {
      const restored = existed ? reg('import', join(run, `${scheme}-before.reg`)) : reg('delete', key(scheme), '/f')
      if (restored.status !== 0) { result.cleanupError = restored.stderr; result.status = 'FAIL'; process.exitCode = 1 }
    }
  }
  writeFileSync(join(run, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
}
