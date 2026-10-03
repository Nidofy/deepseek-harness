/** Exercise menu geometry and automatic selection in the packaged native pet. */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
export async function qualifyPetFixes({ application, page, rpc, until, sessionId, cwd, run, result, prompt, setMode, held, release }) {
  const extra = (method, args = {}) => page.evaluate(async ({ method, args }) => {
    const response = await fetch('/api/nidofy-extras/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) })
    if (!response.ok) throw Error(await response.text())
    return response.json()
  }, { method, args })
  const save = async patch => { const state = await extra('status'); return extra('preferences', { ...state.preferences, ...patch }) }
  // Use the same revisioned preference operation as the visible settings page.
  const state = await extra('status')
  await save({ pets: true, pet: { ...state.preferences.pet, enabled: true, pinned: sessionId }, companions: [] })
  await until(() => application.windows().some(p => p.url().includes('/assets/pet/index.html')), 'pet fix window')
  const pet = application.windows().find(p => p.url().includes('/assets/pet/index.html'))
  await until(async () => (await pet.locator('canvas').getAttribute('data-session')) === sessionId, 'pin selection')
  const window = await application.browserWindow(pet)
  const open = async () => {
    // CDP clicks do not activate an inactive native window on Windows.
    await window.evaluate(w => w.focus())
    await until(() => window.evaluate(w => w.isFocused()), 'native pet focused')
    await pet.locator('canvas').click({ button: 'right' })
    await pet.locator('#menu').waitFor({ state: 'visible' })
  }
  for (const scale of [0.75, 1.25, 1.5, 1]) {
    const preferences=(await extra('status')).preferences;await save({pet:{...preferences.pet,scale}});
    await until(async()=>Math.abs((await window.evaluate(w=>w.getBounds())).width-240*scale)<=1,'pet scale applied');
  for (const edge of ['left', 'right']) {
    const area = await application.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
    await window.evaluate((w, { area, edge }) => { const b = w.getBounds(); w.setPosition(edge === 'left' ? area.x : area.x + area.width - b.width, area.y + 60) }, { area, edge })
    // Windows may briefly change the DIP size while repositioning at fractional display scale.
    await until(async()=>Math.abs((await window.evaluate(w=>w.getBounds())).width-240*scale)<=1,'native position settled');
    const before = await window.evaluate(w => w.getBounds())
    await open()
    const geometry = await pet.evaluate(() => {
      const c = document.querySelector('canvas').getBoundingClientRect(), m = document.querySelector('#menu').getBoundingClientRect()
      return { sprite: c.toJSON(), menu: m.toJSON(), width: innerWidth, height: innerHeight }
    })
    assert.ok(geometry.menu.right <= geometry.sprite.left || geometry.sprite.right <= geometry.menu.left, JSON.stringify(geometry))
    assert.ok(geometry.menu.left >= -0.1 && geometry.menu.right <= geometry.width+0.1 && geometry.menu.bottom <= geometry.height+0.1,JSON.stringify(geometry))
    const expanded = await window.evaluate(w => w.getBounds())
    assert.ok(expanded.x >= area.x-1 && expanded.x + expanded.width <= area.x + area.width+1,JSON.stringify({expanded,area}))
    await pet.screenshot({ path: join(run, 'pet-menu-' + scale + '-' + edge + '.png') })
    await pet.keyboard.press('Escape')
    await pet.locator('#menu').waitFor({ state: 'hidden' })
    try { await until(async () => Math.abs((await window.evaluate(w => w.getBounds())).width-before.width)<=1, 'menu released native space') } catch(e){throw Error(JSON.stringify({edge,scale,before,after:await window.evaluate(w=>w.getBounds()),layout:await pet.evaluate(()=>({width:innerWidth,menu:document.querySelector('#menu').hidden,pet:document.querySelector('#pet').getBoundingClientRect().toJSON()}))}),{cause:e})}
    const closed=await window.evaluate(w => w.getBounds());for(const key of ['x','y','width','height'])assert.ok(Math.abs(closed[key]-before[key])<=1,JSON.stringify({before,closed}));
  }
  }
  result.checks.petMenuBesideSpriteAtBothScreenEdges = true
  const second = await rpc(page, 'session', 'create', { request: { cwd } })
  await rpc(page, 'session', 'selectModel', { request: { sessionId: second.sessionId, provider: 'nidofy-beta', model: 'shared-model' } })
  setMode('pet-hold')
  await rpc(page,'session','prompt',{request:{sessionId:second.sessionId,requestId:crypto.randomUUID(),mode:'queue',content:[{type:'text',text:'PET_QUALIFY_HOLD'}]}})
  await until(held, 'live concurrent model request')
  try {
    await until(async () => (await extra('pet/snapshot')).state.items.some(r => r.sessionId === second.sessionId && r.status === 'RUNNING'), 'real running state reaches pet')
    assert.equal(await pet.locator('canvas').getAttribute('data-session'), sessionId)
    await open()
    await pet.getByRole('menuitemradio', { name: '自动关注任务', exact: true }).click()
    // The workbench fixture arms a workspace-exclusive protection lease; a second
    // concurrent task needs its own workspace to reach the model and ask for input.
    const waitingCwd = join(run, 'pet-wait-workspace'); mkdirSync(waitingCwd, { recursive: true })
    const waiting = await rpc(page, 'session', 'create', { request: { cwd: waitingCwd } })
    await rpc(page, 'session', 'selectModel', { request: { sessionId: waiting.sessionId, provider: 'nidofy-beta', model: 'shared-model' } })
    await rpc(page,'session','prompt',{request:{sessionId:waiting.sessionId,requestId:crypto.randomUUID(),mode:'queue',content:[{type:'text',text:'PET_QUALIFY_QUESTION'}]}})
    try {
      await until(async () => (await pet.locator('canvas').getAttribute('data-session')) === waiting.sessionId, 'waiting task takes priority over running task')
      await until(async () => (await pet.locator('canvas').getAttribute('aria-description')).includes('等待你的输入'), 'real question wait displayed')
      await pet.screenshot({ path: join(run, 'pet-waiting-input.png') })
    } finally { await rpc(page, 'session', 'cancel', { request: { sessionId: waiting.sessionId } }) }
    await until(async () => (await pet.locator('canvas').getAttribute('data-session')) === second.sessionId, 'cancelled question returns focus to running task')
    result.checks.petWaitingTaskPreemptsRunningAndCancellationReturns = true
    await until(async () => (await pet.locator('canvas').getAttribute('data-session')) === second.sessionId, 'automatic mode releases pinned idle task')
    assert.equal((await extra('status')).preferences.pet.pinned, null)
    await open()
    assert.equal(await pet.getByRole('menuitemradio', { name: '自动关注任务', exact: true }).getAttribute('aria-checked'), 'true')
    assert.ok((await pet.locator('#menu p').innerText()).includes('正在处理任务'))
    await pet.screenshot({ path: join(run, 'pet-auto-running.png') })
    await pet.getByRole('menuitemradio', { name: '固定关注此会话', exact: true }).click()
    await until(async()=>(await extra('status')).preferences.pet.pinned===second.sessionId,'pin selection persisted')
    await open()
    await pet.getByRole('menuitemradio', { name: '自动关注任务', exact: true }).click()
  } finally { release() }
  await until(async () => (await pet.locator('canvas').getAttribute('data-session')) === '', 'auto mode becomes idle after completed notice')
  await open()
  assert.ok((await pet.locator('#menu p').innerText()).includes('暂无待处理任务'))
  await page.bringToFront()
  await (await application.browserWindow(page)).evaluate(w => { w.restore(); w.show(); w.focus() })
  await window.evaluate(w => w.blur())
  await until(async () => !(await window.evaluate(w => w.isFocused())), 'native pet lost focus')
  await pet.locator('#menu').waitFor({ state: 'hidden' })
  await until(async () => (await window.evaluate(w => w.getBounds())).width <= 241, 'focus loss releases menu space')
  await open()
  await pet.getByRole('menuitem', { name: '隐藏这只宠物', exact: true }).click()
  await until(() => !application.windows().some(p => p.url().includes('/assets/pet/index.html')), 'hide via menu')
  await save({ pets: false, pet: state.preferences.pet, companions: state.preferences.companions })
  result.checks.petAutomaticTaskSelectionPinAndIdle = true
}
