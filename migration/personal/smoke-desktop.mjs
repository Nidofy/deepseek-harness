/** Qualify the real personal Desktop using private data and synthetic streaming providers. */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron } from '../../node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs'

const repository = fileURLToPath(new URL('../../', import.meta.url))
const build = join(repository, 'apps/desktop/.desktop-build')
const run = mkdtempSync(join(build, 'qualification/personal-'))
const root = join(run, 'data'), cwd = join(run, 'workspace')
mkdirSync(cwd, { recursive: true })
const requests = []
const keys = { openai: 'synthetic-openai-1', anthropic: 'synthetic-anthropic-1' }
const server = createServer(async (request, response) => {
  if (request.method === 'GET') { response.end('personal-network-control'); return }
  let body = ''
  for await (const chunk of request) body += chunk.toString('utf8')
  const protocol = request.url.includes('/anthropic/') ? 'anthropic' : 'openai'
  const expectedPath = protocol === 'anthropic' ? '/anthropic/v1/messages' : '/openai/v1/chat/completions'
  if (request.url.split('?')[0] !== expectedPath) {
    response.writeHead(404); response.end('Unexpected provider path'); return
  }
  const header = protocol === 'anthropic' ? request.headers['x-api-key'] : request.headers.authorization
  const expected = protocol === 'anthropic' ? keys.anthropic : `Bearer ${keys.openai}`
  const marker = `QUALIFIED_${protocol.toUpperCase()}_${requests.length + 1}`
  // Keep only comparison results; neither keys nor model request bodies enter evidence.
  requests.push({ protocol, path: request.url, model: JSON.parse(body).model, credentialMatched: header === expected, marker })
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  const event = value => response.write(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`)
  if (protocol === 'anthropic') {
    event({ type: 'message_start', message: { id: 'msg_synthetic', type: 'message', role: 'assistant', model: 'shared-model',
      content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 3, output_tokens: 0 } } })
    event({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
    event({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: marker } })
    event({ type: 'content_block_stop', index: 0 })
    event({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } })
    event({ type: 'message_stop' })
  } else {
    for (const value of [
      { choices: [{ delta: { role: 'assistant', content: '' }, index: 0, finish_reason: null }] },
      { choices: [{ delta: { content: marker }, index: 0, finish_reason: null }] },
      { choices: [{ delta: {}, index: 0, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1 } },
    ]) response.write(`data: ${JSON.stringify(value)}\n\n`)
    response.write('data: [DONE]\n\n')
  }
  response.end()
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  !/KEY|TOKEN|PASSWORD|SECRET|^DSH_|^DEEPSEEK|^ANTHROPIC|^OPENAI|^GOOGLE|^ELECTRON_RUN_AS_NODE|^NIDOFY_/i.test(name)))
environment.NIDOFY_DESKTOP_DATA_ROOT = root
environment.NO_PROXY = 'localhost,127.0.0.1,::1'
const executablePath = join(build, 'targets/win-x64/personal-unsigned/win-unpacked/Nidofy DSH Desktop.exe')
let application
const result = { status: 'FAIL', run, realCredentialsUsed: false, enterpriseAcceptance: 'deferred', checks: {} }

/** Call the same authenticated Host RPC route used by the official renderer. */
async function rpc(page, namespace, method, args = {}, allowError = false) {
  const envelope = await page.evaluate(async ({ namespace, method, args }) => {
    const operation = `${namespace}/${method}`
    const response = await fetch(`/api/${operation}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: operation, payload: { args } }) })
    if (!response.ok) return { ok: false, error: { status: response.status } }
    return (await response.json()).result
  }, { namespace, method, args })
  if (allowError) return envelope
  assert.equal(envelope?.ok, true, `${namespace}/${method}: ${JSON.stringify(envelope?.error)}`)
  return envelope.value
}

/** Wait for the normal workspace, including the official composer. */
async function launch() {
  application = await _electron.launch({ executablePath, env: environment, timeout: 90000 })
  const page = await application.firstWindow()
  await page.waitForURL('dsh-app://app/**', { timeout: 90000 })
  await page.waitForFunction(() => document.querySelector('[contenteditable="true"], textarea') !== null
    && !document.body.innerText.includes('Loading plugins'), undefined, { timeout: 90000 })
  assert.equal(application.windows().some(window => window.url().includes('welcome.html')), false)
  return page
}

/** Read durable history at the current projection cursor without requiring the optional search index. */
async function historyContains(page, sessionId, marker) {
  const baseline = await rpc(page, 'session', 'projections', { request: { sessionId } })
  assert.ok(baseline)
  const history = await rpc(page, 'session', 'page', { request: {
    address: { kind: 'session', sessionId }, throughSeq: baseline.asOfSeq, maxMessages: 100,
  } })
  return JSON.stringify(history).includes(marker)
}

/** Require a completed turn with the provider's unique answer in durable Session history. */
async function promptAndVerify(page, sessionId, protocol) {
  const before = requests.length
  await rpc(page, 'session', 'prompt', { request: { sessionId, requestId: crypto.randomUUID(), mode: 'queue',
    content: [{ type: 'text', text: 'Reply with your short test response. Do not call tools.' }] } })
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    const captured = requests[before]
    if (captured) {
      assert.equal(captured.protocol, protocol)
      assert.equal(captured.model, 'shared-model')
      assert.equal(captured.credentialMatched, true)
      const persisted = await historyContains(page, sessionId, captured.marker)
      const list = await rpc(page, 'session', 'list', { _request: {} })
      if (persisted
        && list.items.some(item => item.sessionId === sessionId && !item.running)) return captured.marker
    }
    await delay(250)
  }
  throw new Error(`Timed out waiting for durable ${protocol} answer (${requests.length - before} requests)`)
}

try {
  let page = await launch()
  const identity = await application.evaluate(({ app }) => ({ name: app.name, userData: app.getPath('userData'), home: process.env.DSH_HOME }))
  assert.equal(identity.name, 'Nidofy DSH Desktop')
  assert.equal(identity.home, join(root, 'harness'))
  assert.equal(identity.userData, join(root, 'electron'))
  result.identity = identity
  assert.equal(await application.evaluate(async ({ net }, url) => (await net.fetch(url)).text(), base), 'personal-network-control')
  result.checks.chromiumNetworkEnabled = true
  result.publicNetwork = await application.evaluate(async ({ net }) => {
    try {
      const response = await net.fetch('https://example.com/', { signal: AbortSignal.timeout(15000), credentials: 'omit' })
      await response.text()
      return { url: 'https://example.com/', ok: response.ok, status: response.status }
    } catch (error) { return { url: 'https://example.com/', ok: false, error: String(error) } }
  })
  await rpc(page, 'pluginManager', 'listBundles')
  assert.equal((await rpc(page, 'account', 'getState', {}, true)).ok, false)
  assert.equal((await rpc(page, 'productAnalytics', 'enabled', {}, true)).ok, false)
  result.checks.pluginsAvailableAccountAnalyticsAbsent = true
  const initial = (await rpc(page, 'settings', 'describe')).namespaces.find(item => item.ns === 'llm-pi-ai')
  assert.ok(initial)
  const ops = []
  for (const protocol of ['openai', 'anthropic']) {
    const ref = `MIGRATION_${protocol.toUpperCase()}_API_KEY`
    await rpc(page, 'credentials', 'set', { ref, value: keys[protocol] })
    ops.push({ op: 'set', path: ['providers', `migration-${protocol}`], value: { displayName: `Migration ${protocol}`,
      api: protocol === 'openai' ? 'openai-completions' : 'anthropic-messages', apiKeyEnv: ref,
      baseURL: `${base}/${protocol}${protocol === 'openai' ? '/v1' : ''}`, models: [{ id: 'shared-model' }] } })
  }
  await rpc(page, 'settings', 'mutate', { ns: 'llm-pi-ai', ops, expectedRevision: initial.revision })
  const conflict = await rpc(page, 'settings', 'mutate', { ns: 'llm-pi-ai', ops, expectedRevision: initial.revision }, true)
  assert.equal(conflict.ok, false)
  assert.match(JSON.stringify(conflict.error), /settings\/conflict/)
  result.checks.settingsStaleRevisionRejected = true
  const sessions = []
  for (const protocol of ['openai', 'anthropic']) {
    const { sessionId } = await rpc(page, 'session', 'create', { request: { cwd } })
    await rpc(page, 'session', 'selectModel', { request: { sessionId, provider: `migration-${protocol}`, model: 'shared-model' } })
    const marker = await promptAndVerify(page, sessionId, protocol)
    sessions.push({ sessionId, protocol, marker })
  }
  keys.openai = 'synthetic-openai-2'
  await rpc(page, 'credentials', 'set', { ref: 'MIGRATION_OPENAI_API_KEY', value: keys.openai })
  sessions.push({ ...sessions[0], marker: await promptAndVerify(page, sessions[0].sessionId, 'openai') })
  result.checks.protocolsSameModelSeparateCredentials = true
  result.checks.nextTurnUsesRotatedCredential = true
  await page.screenshot({ path: join(run, 'workspace.png') })
  await application.close(); application = undefined
  page = await launch()
  const restored = (await rpc(page, 'settings', 'describe')).namespaces.find(item => item.ns === 'llm-pi-ai')
  assert.ok(restored)
  for (const { sessionId, marker } of sessions) {
    assert.ok(await historyContains(page, sessionId, marker), 'Assistant response survives restart')
  }
  await promptAndVerify(page, sessions[0].sessionId, 'openai')
  result.checks.restartPreservesSettingsCredentialsAndSessions = true
  assert.ok(requests.every(request => request.credentialMatched), 'Every request uses its own current credential')
  await page.screenshot({ path: join(run, 'restart.png') })
  await page.getByText('Settings', { exact: true }).click()
  await page.getByText('Models', { exact: true }).first().click()
  await page.getByText('Migration openai', { exact: true }).waitFor()
  await page.getByText('Migration anthropic', { exact: true }).waitFor()
  await page.screenshot({ path: join(run, 'models.png') })
  result.checks.officialModelSettingsUi = true
  result.requests = requests
  result.status = 'PASS'
} catch (error) {
  result.error = String(error); process.exitCode = 1
  if (application) for (const [index, page] of application.windows().entries()) {
    try { await page.screenshot({ path: join(run, `failure-${index}.png`), timeout: 3000 }) } catch {}
  }
} finally {
  if (application) try { await application.close() } catch (error) {
    result.status = 'FAIL'; result.teardownError = String(error); process.exitCode = 1
  }
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  writeFileSync(join(run, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result, null, 2))
}
