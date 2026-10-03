/** Launch the packaged Desktop with private empty data and exercise its existing local entry. */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron } from '../../node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs'

const repository = fileURLToPath(new URL('../../', import.meta.url))
const output = join(repository, 'apps/desktop/.desktop-build/qualification')
mkdirSync(output, { recursive: true })
const run = mkdtempSync(join(output, 'm0-ui-'))
const home = join(run, 'home')
const profile = join(home, 'profiles/desktop')
mkdirSync(profile, { recursive: true })
writeFileSync(join(profile, 'cordis.patch.yml'), JSON.stringify([
  { id: 'webserver', config: { host: '127.0.0.1', port: 0, compression: 'gzip', compressionLevel: 1, compressionThresholdBytes: 1024 } },
  { id: 'product-analytics', disabled: true },
  { id: 'desktop-product-telemetry', disabled: true },
]))
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  !/KEY|TOKEN|PASSWORD|SECRET|^DSH_|^DEEPSEEK|^ANTHROPIC|^OPENAI|^GOOGLE|^ELECTRON_RUN_AS_NODE/i.test(name)))
Object.assign(environment, {
  DSH_HOME: home, DSH_TELEMETRY_MODE: 'DISABLED',
  HTTP_PROXY: 'http://127.0.0.1:41988', HTTPS_PROXY: 'http://127.0.0.1:41988',
  NO_PROXY: 'localhost,127.0.0.1,::1',
})
const executablePath = resolve(repository, 'apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/win-unpacked/DeepSeek Harness.exe')
let application
let result = { status: 'FAIL', run, modelRequests: 'not initiated', networkIsolationCertified: false }
try {
  application = await _electron.launch({ executablePath, args: [`--user-data-dir=${join(run, 'electron-data')}`], env: environment, timeout: 90_000 })
  let welcome
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline && welcome === undefined) {
    welcome = application.windows().find(page => page.url().includes('/welcome.html'))
    if (welcome === undefined) await delay(100)
  }
  assert.ok(welcome, 'Desktop welcome window did not appear')
  await welcome.waitForFunction(() => typeof window.dshWelcome?.skip === 'function', undefined, { timeout: 60_000 })
  assert.equal(await welcome.evaluate(() => window.dshWelcome.analyticsEnabled()), false)
  await welcome.screenshot({ path: join(run, 'welcome.png') })
  await welcome.evaluate(() => window.dshWelcome.skip())
  const workspace = application.windows().find(page => page.url().startsWith('dsh-app://app/'))
  assert.ok(workspace, 'Desktop workspace window did not appear')
  await workspace.waitForURL('dsh-app://app/**', { timeout: 90_000 })
  await workspace.locator('body').waitFor()
  await workspace.waitForFunction(() => document.querySelector('[contenteditable="true"], textarea') !== null
    && !document.body.innerText.includes('Loading plugins'), undefined, { timeout: 90_000 })
  await workspace.screenshot({ path: join(run, 'workspace.png') })
  result = { ...result, status: 'PASS', welcomeAnalyticsEnabled: false, workspaceUrl: workspace.url(),
    privateHome: home, privateElectronData: join(run, 'electron-data'), credentialsSupplied: false, composerMounted: true }
} catch (error) {
  result = { ...result, error: String(error) }
  if (application !== undefined) {
    const windows = []
    for (const page of application.windows()) {
      try {
        windows.push({ url: page.url(), text: await page.locator('body').innerText({ timeout: 3000 }) })
        await page.screenshot({ path: join(run, `failure-${windows.length}.png`), timeout: 3000 })
      } catch (captureError) { windows.push({ captureError: String(captureError) }) }
    }
    result = { ...result, windows }
  }
  process.exitCode = 1
} finally {
  if (application !== undefined) {
    try { await application.close() }
    catch (error) { result = { ...result, status: 'FAIL', teardownError: String(error) }; process.exitCode = 1 }
  }
  writeFileSync(join(run, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
