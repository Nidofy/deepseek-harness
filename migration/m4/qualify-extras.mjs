/** M4 qualification through the packaged desktop and real profile Loader; only provider responses are synthetic. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export async function qualifyExtras({ application, page, managed, rpc, until, sessionId, cwd, run, result, base, keys, captures, setMode, release }) {
  const extra = async (method, input = {}, expected = 200) => {
    const value = await page.evaluate(async ({ method, input }) => {
      const r = await fetch('/api/nidofy-extras/' + method, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
      return { status: r.status, value: await r.json() }
    }, { method, input })
    assert.equal(value.status, expected, JSON.stringify(value.value)); return value.value
  }
  const save = async change => extra('preferences', { ...(await extra('status')).preferences, ...change })
  const initial = await extra('status')
  assert.equal(initial.upstream, '0.2.0-rc.2')
  for (const feature of ['diagnostics', 'cache', 'vision', 'pets']) assert.equal(initial.preferences[feature], false)
  await application.evaluate(({ Menu }) => {
    const original = Menu.prototype.popup
    Menu.prototype.popup = function(options) {
      Menu.prototype.popup = original
      const find = items => { for (const item of items) { if (/Personal extensions|个人扩展/.test(item.label)) return item; const child = item.submenu && find(item.submenu.items); if (child) return child } }
      const item = find(this.items); if (!item) throw Error('M4 menu missing'); item.click(); options.callback?.()
    }
  })
  await page.getByText('Application', { exact: true }).click()
  await until(() => application.windows().some(p => p.url().includes('/api/nidofy-extras/ui')), 'extras menu')
  const ui = application.windows().find(p => p.url().includes('/api/nidofy-extras/ui'))
  const errors = []; ui.on('pageerror', e => errors.push(String(e)))
  await ui.locator('#records table').waitFor()
  await ui.screenshot({ path: join(run, 'extras-en.png'), fullPage: true })
  const connection = await managed(page, 'status')
  await managed(page, 'mutate', { action: 'save', operationId: crypto.randomUUID(), expectedRevision: connection.desiredRevision, connection: 'probe', key: keys.openai,
    profile: { displayName: 'M4 private probe', api: 'openai-completions', baseURL: `${base}/openai/v1`, models: [{ id: 'shared-model', contextWindow: 65536, input: ['text', 'image'] }], retryPolicy: { mode: 'normal', maxRetries: 0 } } })
  await save({ diagnostics: true, cache: true, vision: true, cachePolicy: { mode: 'session', models: ['shared-model'] }, visionRoute: { provider: 'nidofy-probe', model: 'shared-model', maxTokens: 64 } })
  const firstCapture = captures.length
  await extra('cache/start', { provider: 'nidofy-probe', model: 'shared-model', inputTokens: 512, requests: 4, accepted: false }, 400)
  assert.equal(captures.length, firstCapture)
  await extra('cache/start', { provider: 'nidofy-probe', model: 'shared-model', inputTokens: 512, requests: 4, accepted: true })
  await until(async () => (await extra('status')).probe?.status !== 'RUNNING', 'bounded cache probe')
  const report = (await extra('status')).probe
  assert.equal(report.status, 'COMPLETED', JSON.stringify(report))
  assert.equal(report.conclusion, 'INCONCLUSIVE')
  const sent = captures.slice(firstCapture)
  assert.equal(sent.length, 4)
  assert.match(sent[0].payload.prompt_cache_key, /^dsh_/)
  assert.equal(sent[0].payload.prompt_cache_key, sent[1].payload.prompt_cache_key)
  assert.equal(sent[2].payload.prompt_cache_key, sent[3].payload.prompt_cache_key)
  assert.notEqual(sent[0].payload.prompt_cache_key, sent[2].payload.prompt_cache_key)
  const diagnostic = await extra('diagnostics'), serialized = JSON.stringify(diagnostic)
  assert.equal(diagnostic.records.length, 4)
  for (const secret of [keys.openai, base, 'M4 private probe', 'Synthetic cache test', 'shared-model', cwd]) assert.ok(!serialized.includes(secret), secret)
  const a = await extra('diagnostics/archive'), b = await extra('diagnostics/archive')
  assert.ok(await extra('diagnostics/compare', { a: a.id, b: b.id }))
  writeFileSync(join(run, 'diagnostics-redacted.json'), JSON.stringify(diagnostic, null, 2))
  result.checks.m4BoundedProbeOfficialPayloadHookRedactionAndArchives = true
  assert.equal((await extra('cache/migrate', { schemaVersion: 1, budget: { inputBytes: 8192 } })).inputTokens, null)
  const image = join(cwd, 'vision.png')
  writeFileSync(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWOwSVnwHxkzkC4AALI4I/EJXASAAAAAAElFTkSuQmCC', 'base64'))
  const visionStart = captures.length
  await extra('vision', { path: image, question: 'M4_IMAGE_ONLY', accepted: false }, 400)
  const vision = await extra('vision', { path: image, question: 'M4_IMAGE_ONLY', accepted: true })
  assert.match(vision.text, /QUALIFIED_OPENAI/)
  assert.equal(captures.length, visionStart + 1)
  const visionPayload = captures.at(-1).payload
  assert.ok(JSON.stringify(visionPayload.messages).includes('data:image/'))
  assert.ok(!JSON.stringify(visionPayload.messages).includes('M3 fixture'))
  assert.equal(visionPayload.tools, undefined)
  const visionConnections = await managed(page, 'status')
  await managed(page, 'mutate', { action: 'save', operationId: crypto.randomUUID(), expectedRevision: visionConnections.desiredRevision, connection: 'image-anthropic', key: keys.anthropic,
    profile: { displayName: 'M4 image alternate', api: 'anthropic-messages', baseURL: `${base}/anthropic`, models: [{ id: 'shared-model', contextWindow: 65536, input: ['text','image'] }], retryPolicy: { mode: 'normal', maxRetries: 0 } } })
  await save({visionRoute:{provider:'nidofy-image-anthropic',model:'shared-model',maxTokens:64}})
  assert.match((await extra('vision', {path:image,question:'M4_ANTHROPIC_IMAGE',accepted:true})).text,/QUALIFIED_ANTHROPIC/)
  assert.ok(captures.at(-1).payload.messages.some(m=>m.content.some(c=>c.type==='image'&&c.source.type==='base64')))
  assert.equal(captures.at(-1).payload.tools,undefined)
  result.checks.m4IndependentVisionConsentAndImageProtocol = true
  setMode('hold-probe');const cancelStart=captures.length;await extra('cache/start',{provider:'nidofy-probe',model:'shared-model',inputTokens:512,requests:4,accepted:true});await until(()=>captures.length>cancelStart,'probe held');await extra('cache/cancel');release();await until(async()=>(await extra('status')).probe.status==='CANCELLED','cancel drained');assert.equal(captures.length,cancelStart+1);result.checks.m4ProbeCancellationStopsRemainingBudget=true;
  await ui.reload(); await ui.locator('#records table').waitFor()
  for (const tab of ['diagnostics', 'cache', 'vision', 'pets', 'schedule', 'selftest']) {
    await ui.locator(`[data-tab="${tab}"]`).click()
    await ui.screenshot({ path: join(run, `extras-${tab}.png`), fullPage: true })
  }
  const packageExport = await extra('pet/packages', { action: 'export', resourceId: 'xiaojing', destination: run })
  const preview = await extra('pet/packages', { action: 'preview', source: packageExport.path })
  assert.equal(preview.id, 'xiaojing'); assert.equal(preview.duplicate, true)
  await extra('pet/packages', { action: 'delete', resourceId: 'xiaojing' }, 400)
  const petPreferences=(await extra('status')).preferences; await save({ pets: true, companions: ['2','3'].map(id=>({...petPreferences.pet,id,position:null})) })
  await until(() => application.windows().some(p => p.url().includes('/assets/pet/index.html')), 'pet native window')
  await until(()=>application.windows().filter(p=>p.url().includes('/assets/pet/index.html')).length===3,'three independent pet windows');
  const pet = application.windows().find(p => p.url().includes('/assets/pet/index.html'))
  await until(async () => pet.evaluate(() => { const c = document.querySelector('canvas'); return c && [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].some((x, i) => i % 4 === 3 && x > 0) }), 'pet sprites decoded')
  await pet.screenshot({ path: join(run, 'pet.png') });
  await pet.evaluate(()=>window.nidofyPet.invoke('pet_action',{action:'drag',target:{x:40,y:40}}));await pet.evaluate(()=>window.nidofyPet.invoke('pet_action',{action:'drag-end'}));assert.ok((await extra('status')).preferences.pet.position);
  await pet.evaluate(()=>window.nidofyPet.invoke('pet_action',{action:'bubble-size',target:{height:60}}));
  await until(async () => (await extra('pet/snapshot')).state.items.some(r => r.sessionId === sessionId), 'pet cold session projection')
  let snapshot = await extra('pet/snapshot')
  assert.ok(!JSON.stringify(snapshot.state).includes(cwd))
  const target = { generation: snapshot.state.generation, sessionId }
  await pet.evaluate(target => window.nidofyPet.invoke('pet_action', { action: 'pin', target }), target)
  assert.equal((await extra('status')).preferences.pet.pinned, sessionId)
  const navigation = await pet.evaluate(async target => {
    const value = await window.nidofyPet.invoke('pet_action', { action: 'navigate', target })
    const channel = new BroadcastChannel('nidofy-pet-navigation'); channel.postMessage(value); channel.close()
    return value
  }, target)
  assert.equal(navigation.sessionId, sessionId)
  await page.waitForFunction(() => document.body.innerText.includes('QUALIFIED_ANTHROPIC'), {timeout:15000})
  await pet.evaluate(() => window.nidofyPet.invoke('pet_action', { action: 'unpin' }))
  await save({ pets: false })
  await until(() => !application.windows().some(p => p.url().includes('/assets/pet/index.html')), 'pet disposal')
  result.checks.m4PetRealCanvasWindowResourcesPinNavigateDispose = true
  const scheduleSource = join(run, 'old-schedules.json')
  const scheduleBytes = JSON.stringify({ schemaVersion: 1, items: [{ id: 'old-task', title: 'Paused legacy plan', prompt: 'Reply OK', scheduledAt: 1 }] })
  writeFileSync(scheduleSource, scheduleBytes)
  const imported = await extra('schedule/import', { path: scheduleSource })
  assert.equal(imported.activated, 0); assert.equal(imported.paused[0].status, 'PAUSED')
  assert.equal(readFileSync(scheduleSource, 'utf8'), scheduleBytes)
  const bundles = await rpc(page, 'pluginManager', 'listBundles')
  const scheduleBundle = bundles.find(b => b.name.includes('schedule-bundle'))
  assert.ok(scheduleBundle, JSON.stringify(bundles.map(b => b.name)))
  await rpc(page, 'pluginManager', 'setBundleEnabled', { name: scheduleBundle.name, enabled: true })
  await until(async () => (await extra('schedule/list')).enabled, 'offline bundled official schedule')
  const restored = await extra('schedule/restore', { id: imported.paused[0].id, sessionId, accepted: true, request: { title: 'Restored future task', prompt: 'Reply OK', every_seconds: 3600 } })
  assert.equal(restored.status, 'RESTORED')
  await extra('schedule/restore', { id: imported.paused[0].id, sessionId, accepted: true, request: { title: 'duplicate', prompt: 'Reply OK', every_seconds: 3600 } }, 409)
  result.checks.m4OfflineOfficialSchedulePausedImportExplicitFutureRestore = true
  await save({pets:true})
  await until(()=>application.windows().filter(p=>p.url().includes('/assets/pet/index.html')).length===3,'pets before cancelled quit')
  await application.evaluate(({app,dialog})=>{
    globalThis.m4CancelledQuit=false
    const original=dialog.showMessageBox.bind(dialog)
    dialog.showMessageBox=async (...args)=>{
      if(args.at(-1).buttons?.some(b=>/^(Quit|退出)$/.test(b))) {
        globalThis.m4CancelledQuit=true;dialog.showMessageBox=original
        return {response:1,checkboxChecked:false}
      }
      return original(...args)
    }
    app.quit()
  })
  await until(()=>application.evaluate(()=>globalThis.m4CancelledQuit),'official scheduled quit cancelled')
  assert.equal(application.windows().filter(p=>p.url().includes('/assets/pet/index.html')).length,3)
  assert.ok(await application.windows().find(p=>p.url().includes('/assets/pet/index.html')).evaluate(()=>window.nidofyPet.invoke('pet_snapshot')))
  await save({pets:false})
  await until(()=>!application.windows().some(p=>p.url().includes('/assets/pet/index.html')),'pets after cancelled quit remain controllable')
  result.checks.m4CancelledOfficialQuitPreservesPetController=true
  await ui.goto('dsh-app://app/api/nidofy-extras/ui?locale=zh-CN')
  await ui.getByRole('heading', { name: '个人扩展', exact: true }).waitFor()
  await ui.locator('#records table').waitFor()
  await ui.screenshot({ path: join(run, 'extras-zh.png'), fullPage: true })
  assert.deepEqual(errors, [])
  result.checks.m4BilingualDashboardAllTabsRender = true
  const theme = (await rpc(page, 'settings', 'describe')).namespaces.find(n => n.ns === 'ui-theme')
  assert.ok(theme)
  for (const [preference, fontSize] of [['dark', 22], ['light', 10]]) {
    await rpc(page, 'settings', 'mutate', { ns: 'ui-theme', ops: [{ op: 'set', path: ['preference'], value: preference }, { op: 'set', path: ['fontSize'], value: fontSize }] })
    await until(async () => page.evaluate(({preference,fontSize}) => document.documentElement.style.colorScheme === preference && document.body.style.getPropertyValue('--dsh-content-font-size') === `${fontSize}px`, {preference,fontSize}), 'official appearance adoption')
    await page.screenshot({path:join(run, `official-theme-${preference}.png`)})
  }
  await rpc(page, 'settings', 'mutate', { ns: 'ui-theme', ops: [{ op: 'set', path: ['preference'], value: theme.value.preference }, { op: 'set', path: ['fontSize'], value: theme.value.fontSize }] })
  result.checks.m4OfficialThemeAndFontLiveAdoption = true
  await save({ diagnostics: false, cache: false, vision: false, pets: false })
  const retained = (await extra('diagnostics')).records.length
  await ui.close()
  const plugins = await rpc(page, 'pluginManager', 'listPlugins')
  const extras = plugins.find(p => p.patchId === 'nidofy-extras' || p.moduleName === '@nidofy/dsh-desktop-extras')
  assert.ok(extras)
  await save({cache:true})
  setMode('hold-probe'); const unloadingStart=captures.length
  await extra('cache/start',{provider:'nidofy-probe',model:'shared-model',inputTokens:512,requests:4,accepted:true})
  await until(()=>captures.length>unloadingStart,'active probe before plugin unload')
  await rpc(page, 'pluginManager', 'setPluginEnabled', { id: extras.entryId, enabled: false })
  release(); assert.equal(captures.length,unloadingStart+1)
  await until(async () => page.evaluate(async () => (await fetch('/api/nidofy-extras/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status !== 200), 'plugin fully unloaded')
  assert.equal((await managed(page, 'status')).appliedRevision, (await managed(page, 'status')).desiredRevision)
  assert.ok(await managed(page, 'protection', { action: 'scopes' }))
  await rpc(page, 'pluginManager', 'setPluginEnabled', { id: extras.entryId, enabled: true })
  await until(async () => { try { return (await extra('status')).features.vision === 'DISABLED' } catch { return false } }, 'plugin reloaded')
  assert.equal((await extra('diagnostics')).records.length, 0)
  assert.equal((await extra('cache/history')).status,'CANCELLED')
  await save({cache:false})
  assert.ok(retained > 0)
  result.checks.m4OptionalUnloadReloadLeavesCoreOwnersAvailable = true
  result.extras = { probe: report, selftest: await extra('selftest'), archivedReports: 2, packageExportSha256: createHash('sha256').update(readFileSync(packageExport.path)).digest('hex') }
  // The restored future schedule legitimately asks for quit confirmation. Accept only
  // that test-owned native dialog, then let the normal Host shutdown drain resources.
  await application.evaluate(({dialog}) => {
    const original = dialog.showMessageBox.bind(dialog)
    dialog.showMessageBox = async (...args) => {
      const options = args.at(-1)
      if (options.buttons?.some(b => /^(Quit|退出)$/.test(b))) return {response:0,checkboxChecked:false}
      return original(...args)
    }
  })
}
