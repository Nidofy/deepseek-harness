/** Real packaged UI qualification with private data, synthetic configuration and no credentials. */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron } from '../../node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs'

const repository = fileURLToPath(new URL('../../', import.meta.url))
const build = join(repository, 'apps/desktop/.desktop-build')
const run = mkdtempSync(join(build, 'qualification/m1-ui-'))
const root = join(run, 'intranet')
const legacyHome = join(run, 'official-home')
mkdirSync(legacyHome, { recursive: true })
writeFileSync(join(legacyHome, 'sentinel'), 'official data must remain unchanged')
let contacts = 0
const sink = createServer((_request, response) => { contacts++; response.writeHead(200); response.end('synthetic') })
sink.listen(0, '127.0.0.1')
await once(sink, 'listening')
const sinkUrl = `http://127.0.0.1:${sink.address().port}`
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  !/KEY|TOKEN|PASSWORD|SECRET|^DSH_|^DEEPSEEK|^ANTHROPIC|^OPENAI|^GOOGLE|^ELECTRON_RUN_AS_NODE|^NIDOFY_/i.test(name)))
Object.assign(environment, { DSH_HOME: legacyHome, NIDOFY_DESKTOP_DATA_ROOT: root,
  HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1', NO_PROXY: 'localhost,127.0.0.1,::1',
  DSH_PRODUCT_ANALYTICS_OTLP_URL: sinkUrl, DSH_TELEMETRY_MODE: 'ALWAYS',
})
const executablePath = join(build, 'targets/win-x64/unsigned-artifacts/win-unpacked/Nidofy DSH Intranet.exe')
let application, official
let result = { status: 'FAIL', run, credentialsSupplied: false, enterpriseGatewayCertified: false }
async function workspace(app) {
  const page = await app.firstWindow()
  await page.waitForURL('dsh-app://app/**', { timeout: 90000 })
  await page.waitForFunction(() => document.querySelector('[contenteditable="true"], textarea') !== null
    && !document.body.innerText.includes('Loading plugins'), undefined, { timeout: 90000 })
  assert.equal(app.windows().some(window => window.url().includes('welcome.html')), false)
  return page
}
async function assertRpc(page, namespace, method, available, args = {}) {
  const allowed = await page.evaluate(async ({ namespace, method, args }) => {
    const rpcId = crypto.randomUUID(), operation = `${namespace}/${method}`
    const response = await fetch(`/api/${operation}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method: operation, payload: { args } }) })
    if (!response.ok) return false
    const body = await response.json()
    return body.result?.ok === true
  }, { namespace, method, args })
  assert.equal(allowed, available, `${namespace}/${method} availability`)
}
try {
  application = await _electron.launch({ executablePath, env: environment, timeout: 90000 })
  let page = await workspace(application)
  const identity = await application.evaluate(({ app }) => ({ name: app.name, userData: app.getPath('userData'), home: process.env.DSH_HOME }))
  assert.equal(identity.home, join(root, 'harness'))
  assert.equal(identity.userData, join(root, 'electron'))
  const deniedNetwork = await application.evaluate(async ({ net }, url) => {
    try { await net.fetch(url); return false } catch { return true }
  }, sinkUrl)
  assert.equal(deniedNetwork, true)
  await assertRpc(page, 'settings', 'describe', true)
  await assertRpc(page, 'productAnalytics', 'enabled', false)
  await assertRpc(page, 'account', 'getState', false)
  await assertRpc(page, 'pluginManager', 'listBundles', false)
  await assertRpc(page, 'pluginRegistryProbe', 'fastest', false)
  await page.screenshot({ path: join(run, 'first-start.png') })
  await application.close(); application = undefined

  const profile = join(root, 'harness/profiles/desktop')
  writeFileSync(join(profile, 'cordis.patch.yml'), JSON.stringify([
    { id: 'product-analytics', disabled: false, config: { enabled: true } },
    { id: 'desktop-product-telemetry', disabled: false, config: { endpoint: sinkUrl } },
    { id: 'session-log-deepseek', disabled: false },
    { id: 'deepseek-account', disabled: false },
    { id: 'webserver', config: { host: '0.0.0.0', port: 19387 } },
  ]))
  const officialProfile = join(legacyHome, 'profiles/desktop')
  mkdirSync(officialProfile, { recursive: true })
  writeFileSync(join(officialProfile, 'cordis.patch.yml'), JSON.stringify([
    { id: 'webserver', config: { host: '127.0.0.1', port: 19387, compression: 'gzip', compressionLevel: 1, compressionThresholdBytes: 1024 } },
    { id: 'product-analytics', disabled: true }, { id: 'desktop-product-telemetry', disabled: true },
  ]))
  const officialEnv = { ...environment, DSH_HOME: legacyHome, DSH_TELEMETRY_MODE: 'DISABLED' }
  delete officialEnv.NIDOFY_DESKTOP_DATA_ROOT
  official = await _electron.launch({ executablePath: join(build, 'qualification/m0-official-win-unpacked/DeepSeek Harness.exe'),
    args: [`--user-data-dir=${join(run, 'official-electron')}`], env: officialEnv, timeout: 90000 })
  let welcome
  const deadline = Date.now() + 90000
  while (welcome === undefined && Date.now() < deadline) {
    welcome = official.windows().find(page => page.url().includes('/welcome.html'))
    if (welcome === undefined) await delay(100)
  }
  assert.ok(welcome, 'Official Host must finish startup while owning its default port')
  await welcome.waitForFunction(() => typeof window.dshWelcome?.skip === 'function')
  await welcome.evaluate(() => window.dshWelcome.skip())
  const officialPage = official.windows().find(page => page.url().startsWith('dsh-app://app/'))
  assert.ok(officialPage)
  await officialPage.waitForFunction(() => document.querySelector('[contenteditable="true"], textarea') !== null
    && !document.body.innerText.includes('Loading plugins'), undefined, { timeout: 90000 })
  await officialPage.screenshot({ path: join(run, 'official-workspace.png') })
  application = await _electron.launch({ executablePath, env: environment, timeout: 90000 })
  page = await workspace(application)
  await assertRpc(page, 'settings', 'describe', true)
  await assertRpc(page, 'productAnalytics', 'enabled', false)
  await assertRpc(page, 'account', 'getState', false)
  assert.equal(await officialPage.locator('[contenteditable="true"], textarea').count() > 0, true)
  await page.screenshot({ path: join(run, 'coexistence.png') })
  assert.equal(readFileSync(join(legacyHome, 'sentinel'), 'utf8'), 'official data must remain unchanged')
  assert.equal(contacts, 0)
  result = { ...result, status: 'PASS', identity, directLocalEntry: true, restartWithHostileProfile: true,
    coexistence: true, blockedChromiumRequest: true, telemetrySinkContacts: contacts }
} catch (error) {
  result.error = String(error); process.exitCode = 1
  if (application) for (const [index, page] of application.windows().entries()) {
    try { await page.screenshot({ path: join(run, `failure-${index}.png`), timeout: 3000 }) } catch {}
  }
} finally {
  for (const app of [application, official]) if (app) {
    try { await app.close() } catch (error) { result.status = 'FAIL'; result.teardownError = String(error); process.exitCode = 1 }
  }
  sink.closeAllConnections()
  await new Promise(resolve => sink.close(resolve))
  writeFileSync(join(run, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result, null, 2))
}
