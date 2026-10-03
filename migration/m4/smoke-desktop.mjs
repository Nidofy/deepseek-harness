import { qualifyExtras } from './qualify-extras.mjs'
import { qualify } from '../m3/qualify-workbench.mjs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
/** Qualify the real personal Desktop using private data and synthetic streaming providers. */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, linkSync, unlinkSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron } from '../../node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs'

const repository = fileURLToPath(new URL('../../', import.meta.url))
const build = join(repository, 'apps/desktop/.desktop-build')
const run = mkdtempSync(join(build, 'qualification/m4-'))
const root = join(run, 'data'), cwd = mkdtempSync(join(tmpdir(), 'nidofy-m4-workspace-'))
mkdirSync(cwd, { recursive: true })
execFileSync('git', ['init', cwd], { windowsHide: true })
const captures = []; const requests = []; let mode='normal', resumeRequest, modelToolContract;
const keys = { openai: 'synthetic-openai-1', anthropic: 'synthetic-anthropic-1', beta: 'synthetic-independent-beta' }
const server = createServer(async (request, response) => {
  if (request.method === 'GET') { response.end('personal-network-control'); return }
  let body = ''
  for await (const chunk of request) body += chunk.toString('utf8')
  const protocol = request.url.includes('/anthropic/') ? 'anthropic' : 'openai'
  const expectedPath = protocol === 'anthropic' ? '/anthropic/v1/messages' : '/openai/v1/chat/completions'
  if (request.url.split('?')[0] !== expectedPath) {
    response.writeHead(404); response.end('Unexpected provider path'); return
  }
  captures.push({ protocol, payload: JSON.parse(body) });
  const header = protocol === 'anthropic' ? request.headers['x-api-key'] : request.headers.authorization
  const expected = protocol === 'anthropic' ? keys.anthropic : `Bearer ${keys.openai}`
  const marker = `QUALIFIED_${protocol.toUpperCase()}_${requests.length + 1}`
  // Keep only comparison results; neither keys nor model request bodies enter evidence.
  requests.push({ protocol, path: request.url, model: JSON.parse(body).model,
    credentialMatched: header === expected || protocol === 'anthropic' && header === keys.beta,
    credentialSlot: header === keys.beta ? 'beta' : protocol, marker, toolUse: ['project-action', 'present-artifact'].includes(mode) && protocol === 'anthropic' })
  if(mode==='pause-error' && protocol==='openai'){mode='normal';await new Promise(resolve=>{resumeRequest=resolve});response.writeHead(500,{'content-type':'application/json'});response.end(JSON.stringify({error:{message:'synthetic transient error'}}));return}
  if(mode==='hold-probe'){mode='normal';await new Promise(resolve=>{resumeRequest=resolve;response.once('close',resolve)});if(response.destroyed)return;}
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  const event = value => response.write(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`)
  if (protocol === 'anthropic') {
    event({ type: 'message_start', message: { id: 'msg_synthetic', type: 'message', role: 'assistant', model: 'shared-model',
      content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 3, output_tokens: 0 } } })
    if (['project-action', 'present-artifact'].includes(mode)) {
      const toolName = mode === 'project-action' ? 'run_project_action' : 'present'
      const toolInput = mode === 'project-action' ? { id: 'build' } : { files: [{ path: 'report.txt', description: 'M3 fixture delivery' }] }
      mode = mode === 'project-action' ? 'present-artifact' : 'normal'
      assert.ok(JSON.parse(body).tools.some(tool => tool.name === 'run_project_action'))
      modelToolContract = JSON.parse(body).tools.filter(tool => ['list_project_actions', 'run_project_action'].includes(tool.name))
      event({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'm3_' + toolName, name: toolName, input: {} } })
      event({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(toolInput) } })
      event({ type: 'content_block_stop', index: 0 })
      event({ type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 8 } })
      event({ type: 'message_stop' })
      response.end(); return
    }
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
const executablePath = join(build, 'targets/win-x64/candidates/m4/personal-unsigned/win-unpacked/Nidofy DSH Desktop.exe')
let application
const result = { status: 'FAIL', scope: process.env.NIDOFY_M4_EXTRAS_ONLY === '1' ? 'M2+M4' : 'M2+M3+M4', run, realCredentialsUsed: false, enterpriseAcceptance: 'deferred', checks: {} }

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
  await page.waitForFunction(() => document.body.innerText.includes('New Session')
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
    const captured = requests.slice(before).findLast(row => !row.toolUse)
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

async function managed(page, method, args = {}, expectedStatus = 200) {
  const envelope = await page.evaluate(async ({ method, args }) => {
    const response = await fetch('/api/nidofy/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) })
    return { status: response.status, value: await response.json() }
  }, { method, args })
  assert.equal(envelope.status, expectedStatus, JSON.stringify(envelope.value))
  return envelope.value
}
const profile = protocol => ({ displayName: `M2 ${protocol}`, api: protocol === 'openai' ? 'openai-completions' : 'anthropic-messages',
  baseURL: `${base}/${protocol}${protocol === 'openai' ? '/v1' : ''}`, models: [{ id: 'shared-model' }],
  retryPolicy: { mode: 'normal', maxRetries: 2, backoff: { initialDelayMs: 100, maxDelayMs: 100, jitterRatio: 0 } } })
async function save(page, connection, protocol) {
  const state = await managed(page, 'status')
  return managed(page, 'mutate', { action: 'save', operationId: crypto.randomUUID(), expectedRevision: state.desiredRevision,
    connection, profile: profile(protocol), key: connection === 'beta' ? keys.beta : keys[protocol] })
}
async function until(predicate, label) {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) { if (await predicate()) return; await delay(200) }
  throw Error(`Timed out: ${label}`)
}
async function prompt(page, sessionId) {
  await rpc(page, 'session', 'prompt', { request: { sessionId, requestId: crypto.randomUUID(), mode: 'queue', content: [{ type: 'text', text: 'Reply with your short test response. Do not call tools.' }] } })
}
try {
  let page = await launch()
  assert.equal(await page.evaluate(async()=> (await fetch('/api/nidofy-extras/status',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status),200,'optional plugin must mount through packaged Loader')
  const first = await save(page, 'alpha', 'openai')
  await save(page, 'beta', 'anthropic')
  await managed(page, 'mutate', { action: 'save', operationId: crypto.randomUUID(), expectedRevision: 0,
    connection: 'alpha', profile: profile('openai'), key: keys.openai }, 409)
  const state = await managed(page, 'status', { operationId: first.operationId })
  assert.equal(state.committed, true); assert.equal(state.desiredRevision, state.appliedRevision)
  result.checks.casAndAck = true
  const { sessionId } = await rpc(page, 'session', 'create', { request: { cwd } })
  await rpc(page, 'session', 'selectModel', { request: { sessionId, provider: 'nidofy-alpha', model: 'shared-model' } })
  mode = 'pause-error'
  await prompt(page, sessionId)
  await until(() => resumeRequest !== undefined, 'first request held')
  const held = await managed(page, 'status')
  assert.ok(held.activeLeases > 0)
  const switched = await save(page, 'alpha', 'anthropic')
  assert.equal(switched.hostEpoch, first.hostEpoch)
  resumeRequest()
  await until(async () => requests.length >= 2 && await historyContains(page, sessionId, requests[1].marker), 'retry A persisted')
  await until(async () => (await rpc(page, 'session', 'list', { _request: {} })).items.some(row => row.sessionId === sessionId && !row.running), 'first turn ended')
  assert.equal(requests[0].protocol, 'openai'); assert.equal(requests[1].protocol, 'openai')
  assert.equal(requests[1].credentialMatched, true)
  await promptAndVerify(page, sessionId, 'anthropic')
  assert.equal(requests.at(-1).credentialSlot, 'anthropic')
  const second = await rpc(page, 'session', 'create', { request: { cwd } })
  await rpc(page, 'session', 'selectModel', { request: { sessionId: second.sessionId, provider: 'nidofy-beta', model: 'shared-model' } })
  await promptAndVerify(page, second.sessionId, 'anthropic')
  assert.equal(requests.at(-1).credentialSlot, 'beta')
  result.checks.activeRetryUsesAAndNewTurnUsesBWithoutRestart = true
  assert.ok(requests.every(row => row.credentialMatched))
  result.checks.sameModelIndependentConnections = true
  const scope = await managed(page, 'protection', { action: 'scopes' })
  writeFileSync(join(cwd, 'protected.txt'), 'owned-test-content')
  await managed(page, 'protection', { action: 'arm', workspace: cwd, paths: ['protected.txt'], revision: scope.revision })
  await promptAndVerify(page, sessionId, 'anthropic')
  await until(async () => (await managed(page, 'protection', { action: 'list' })).items.length === 1, 'snapshot sealed')
  result.checks.nativeProtectionPackagedLifecycle = true
  linkSync(join(cwd, 'protected.txt'), join(cwd, 'alias.txt'))
  const beforeFailure = requests.length
  await prompt(page, sessionId)
  await delay(1500)
  await until(async () => (await rpc(page, 'session', 'list', { _request: {} })).items.some(row => row.sessionId === sessionId && !row.running), 'failed protection turn ended')
  assert.equal(requests.length, beforeFailure)
  result.checks.protectionFailurePreventsModelAndTools = true
  unlinkSync(join(cwd, 'alias.txt'))
  const nativeScopes = await managed(page, 'protection', { action: 'scopes' })
  await managed(page, 'protection', { action: 'disarm', id: nativeScopes.items[0].id, revision: nativeScopes.revision })
  await application.evaluate(({ Menu }) => {
    const original = Menu.prototype.popup
    Menu.prototype.popup = function(options) {
      Menu.prototype.popup = original
      const item = this.items.find(item => /Connections and migration|连接与数据迁移/.test(item.label))
      if (!item) throw Error('M2 menu missing')
      item.click(); options.callback?.()
    }
  })
  await page.getByText('Application', { exact: true }).click()
  await until(() => application.windows().some(window => window.url().includes('/api/nidofy/ui')), 'editor menu window')
  const editor = application.windows().find(window => window.url().includes('/api/nidofy/ui'))
  await editor.locator('#list button').first().waitFor()
  await editor.screenshot({ path: join(run, 'connections.png'), fullPage: true })
  result.checks.desktopConnectionEditor = true
  await editor.close()
  const source = join(run, 'legacy')
  const sourceSession = join(source, 'dsh', 'sessions', `--${cwd.replace(/[:\\/]+/g, '-').slice(0, 251)}--`, 'm2-imported')
  mkdirSync(sourceSession, { recursive: true })
  const importedMarker = 'M2_LEGACY_MESSAGE_PRESERVED'
  const sourceRows = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', surfaceOp: 'append', data: { id: 'legacy-user', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: importedMarker }] } },
    { type: 'session/title', data: { title: 'Imported M2 conversation', source: { kind: 'fallback' }, messageSeqs: [1] } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ].map((event, seq) => ({ ...event, seq, time: Date.now() + seq }))
  const sourceBytes = [
    { type: 'session', version: 3, id: 'm2-imported', cwd, createdAt: Date.now(), isSeeded: false, delegationDepth: 0 }, ...sourceRows,
  ].map(row => JSON.stringify(row) + '\n').join('')
  writeFileSync(join(sourceSession, 'session.v3.jsonl'), sourceBytes)
  writeFileSync(join(source, 'connection.json'), JSON.stringify({ providerName: 'Imported', baseUrl: `${base}/openai/v1`, model: 'shared-model', api: 'openai-completions' }))
  const request = { source, sourceVersion: '0.2.0', operationId: crypto.randomUUID() }
  const imported = await managed(page, 'import', request)
  assert.equal(imported.sessions, 1)
  assert.deepEqual(await managed(page, 'import', request), imported)
  assert.equal(readFileSync(join(sourceSession, 'session.v3.jsonl'), 'utf8'), sourceBytes)
  result.checks.copyImportIdempotentSourceUnchanged = true
  await application.close(); application = undefined
  page = await launch()
  const restarted = await managed(page, 'status')
  assert.notEqual(restarted.hostEpoch, first.hostEpoch)
  await promptAndVerify(page, sessionId, 'anthropic')
  result.checks.restartRetainsConnectionsAndHistory = true
  if (process.env.NIDOFY_M4_EXTRAS_ONLY !== '1') await qualify({ application, page, managed, rpc, until, promptAndVerify, sessionId, cwd, run, result,
    invokeAction: async () => { mode = 'project-action'; await promptAndVerify(page, sessionId, 'anthropic') } })
  await qualifyExtras({ application, page, managed, rpc, until, sessionId, cwd, run, result, base, keys, captures, setMode: value => { mode=value; resumeRequest=undefined }, release: () => resumeRequest?.() });
  await application.close(); application = undefined
  environment.NIDOFY_DESKTOP_DATA_ROOT = imported.dataRoot
  page = await launch()
  const importedState = await managed(page, 'status')
  assert.equal(importedState.importedConnections.length, 1)
  assert.equal(importedState.connections.length, 0)
  const importedSessions = await rpc(page, 'session', 'list', { _request: {} })
  assert.ok(importedSessions.items.some(row => row.sessionId === 'm2-imported'))
  assert.ok(await historyContains(page, 'm2-imported', importedMarker))
  // The optional list index is disabled in this profile; cold imported rows are initially Untitled.
  await page.getByText('Untitled', { exact: true }).first().click()
  await page.waitForFunction(marker => document.body.innerText.includes(marker), importedMarker)
  result.checks.importedCopyBootsWithHistoryAndNoCredentials = true
  await page.screenshot({ path: join(run, 'imported.png') })
  result.requests = requests
  result.modelToolContract = modelToolContract
  result.status = 'PASS'
} catch (error) {
  result.error = String(error); result.stack = error.stack; process.exitCode = 1
  if (application) for (const [index, page] of application.windows().entries()) {
    try { await page.screenshot({ path: join(run, `failure-${index}.png`), timeout: 3000 }) } catch (_error) { /* Closed windows have no screenshot. */ }
  }
} finally {
  resumeRequest?.()
  if (application) try { await application.close() } catch (error) { result.status = 'FAIL'; result.teardownError = String(error); process.exitCode = 1 }
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  writeFileSync(join(run, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result, null, 2))
}
