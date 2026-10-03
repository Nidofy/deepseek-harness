import { cpSync, readdirSync, lstatSync, readlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
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
const run = mkdtempSync(join(build, 'qualification/m5-upgrade-'))
const root = join(run, 'data'), cwd = mkdtempSync(join(tmpdir(), 'nidofy-m5-'))
mkdirSync(cwd, { recursive: true })
const requests = []; let mode='normal', resumeRequest;
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
  const header = protocol === 'anthropic' ? request.headers['x-api-key'] : request.headers.authorization
  const expected = protocol === 'anthropic' ? keys.anthropic : `Bearer ${keys.openai}`
  const marker = `QUALIFIED_${protocol.toUpperCase()}_${requests.length + 1}`
  // Keep only comparison results; neither keys nor model request bodies enter evidence.
  requests.push({ protocol, path: request.url, model: JSON.parse(body).model,
    credentialMatched: header === expected || protocol === 'anthropic' && header === keys.beta,
    credentialSlot: header === keys.beta ? 'beta' : protocol, marker })
  if(mode==='pause-error' && protocol==='openai'){mode='normal';await new Promise(resolve=>{resumeRequest=resolve});response.writeHead(500,{'content-type':'application/json'});response.end(JSON.stringify({error:{message:'synthetic transient error'}}));return}
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
let executablePath = join(build, 'targets/win-x64/personal-unsigned/win-unpacked/Nidofy DSH Desktop.exe')
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
const oldExecutable=executablePath
const newExecutable=join(build,'targets/win-x64/candidates/m4-environment-details/personal-unsigned/win-unpacked/Nidofy DSH Desktop.exe')
function treeDigest(dir){
  const hash=createHash('sha256')
  const walk=(path,prefix='')=>{for(const entry of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const next=join(path,entry.name),name=prefix+'/'+entry.name;hash.update(name);if(entry.isSymbolicLink())hash.update(readlinkSync(next));else if(entry.isDirectory())walk(next,name);else hash.update(readFileSync(next))}}
  walk(dir);return hash.digest('hex')
}
const backup=join(run,'before-upgrade'),upgraded=join(run,'upgraded'),rollback=join(run,'rollback')
try {
  let page=await launch()
  result.oldVersion=await application.evaluate(({app})=>app.getVersion())
  assert.match(result.oldVersion,/rc\.1/)
  await save(page,'alpha','openai')
  const {sessionId}=await rpc(page,'session','create',{request:{cwd}})
  await rpc(page,'session','selectModel',{request:{sessionId,provider:'nidofy-alpha',model:'shared-model'}})
  const oldMarker=await promptAndVerify(page,sessionId,'openai')
  writeFileSync(join(cwd,'protected.txt'),'M5 preserved workspace')
  const scopes=await managed(page,'protection',{action:'scopes'})
  await managed(page,'protection',{action:'arm',workspace:cwd,paths:['protected.txt'],revision:scopes.revision})
  await promptAndVerify(page,sessionId,'openai')
  await until(async()=> (await managed(page,'protection',{action:'list'})).items.length>0,'old protection snapshot')
  await application.close();application=undefined
  cpSync(root,backup,{recursive:true,dereference:true})
  const beforeHash=treeDigest(backup)
  cpSync(backup,upgraded,{recursive:true,dereference:true})
  environment.NIDOFY_DESKTOP_DATA_ROOT=upgraded;executablePath=newExecutable
  page=await launch()
  result.newVersion=await application.evaluate(({app})=>app.getVersion())
  assert.match(result.newVersion,/rc\.2/)
  assert.ok(await historyContains(page,sessionId,oldMarker))
  const connections=await managed(page,'status');assert.ok(connections.connections.some(row=>row.id==='alpha'||row.connection==='alpha'))
  assert.ok((await managed(page,'protection',{action:'scopes'})).items.length>0)
  const count=(await managed(page,'protection',{action:'list'})).items.length
  const newMarker=await promptAndVerify(page,sessionId,'openai')
  await until(async()=> (await managed(page,'protection',{action:'list'})).items.length>count,'new protection snapshot')
  result.checks.rc1ToRc2HistoryConnectionCredentialAndProtection=true
  await application.evaluate(({powerMonitor})=>{powerMonitor.emit('suspend');powerMonitor.emit('resume')})
  await promptAndVerify(page,sessionId,'openai')
  result.checks.simulatedResumeThenTurn=true
  const window=await application.browserWindow(page)
  await window.evaluate(w=>w.close())
  await until(()=>application.windows().some(p=>p!==page),'first close acknowledgement')
  const notice=application.windows().find(p=>p!==page)
  await notice.getByRole('button',{name:'Confirm',exact:true}).click()
  await until(async()=>await window.evaluate(w=>!w.isVisible()),'close hides window')
  await window.evaluate(w=>{w.show();w.focus()})
  await promptAndVerify(page,sessionId,'openai')
  result.checks.hideShowRetainsHost=true
  await application.close();application=undefined
  page=await launch()
  assert.ok(await historyContains(page,sessionId,newMarker))
  await promptAndVerify(page,sessionId,'openai')
  result.checks.upgradedRestartContinuesSession=true
  await application.close();application=undefined
  assert.equal(treeDigest(backup),beforeHash)
  cpSync(backup,rollback,{recursive:true,dereference:true})
  environment.NIDOFY_DESKTOP_DATA_ROOT=rollback;executablePath=oldExecutable
  page=await launch()
  assert.ok(await historyContains(page,sessionId,oldMarker))
  assert.equal(await historyContains(page,sessionId,newMarker),false)
  await promptAndVerify(page,sessionId,'openai')
  result.checks.oldPackageAndPreUpgradeCopyRestore=true
  await application.close();application=undefined
  assert.equal(treeDigest(backup),beforeHash)
  result.checks.preUpgradeBackupUnchanged=true
  result.status='PASS';result.backupDigest=beforeHash
  result.actualSleep='NOT_TESTED';result.cleanMachine='NOT_TESTED';result.signedInstaller='NOT_TESTED'
}catch(error){result.error=String(error);result.stack=error.stack;process.exitCode=1}
finally{resumeRequest?.();if(application)await application.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));writeFileSync(join(run,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))}
