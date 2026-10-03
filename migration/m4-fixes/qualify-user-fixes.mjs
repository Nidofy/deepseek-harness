/** Reproduce reported interactions through the packaged UI, without provider credentials. */
import assert from 'node:assert/strict'
import { join } from 'node:path'
export async function qualifyUserFixes({ application, page, until, run, result, cwd, sessionId }) {
  await (await application.browserWindow(page)).evaluate(window => { window.restore(); window.show(); window.focus() })
  await page.bringToFront()
  await page.getByRole('button', { name: 'Account menu', exact: true }).click()
  await page.getByText('Sign in', { exact: true }).waitFor()
  await page.screenshot({ path: join(run, 'official-login-option.png'), timeout: 60000 })
  await page.keyboard.press('Escape')
  result.checks.optionalOfficialLoginEntry = true
  await page.getByRole('button', { name: 'Environment', exact: true }).click()
  await until(async () => !(await page.locator('.nidofy-environment section').innerText()).includes('Loading'), 'initial folder resolves')
  assert.ok(!(await page.locator('.nidofy-environment section').innerText()).includes('NO_REPOSITORY'))
  await page.locator('.nidofy-environment section').getByRole('button', { name: 'Close', exact: true }).click()
  await page.evaluate(id => { const channel = new BroadcastChannel('nidofy-pet-navigation'); channel.postMessage({ sessionId: id }); channel.close() }, sessionId)
  await page.getByRole('button', { name: 'Environment', exact: true }).click()
  const card = page.locator('.nidofy-environment section')
  await card.waitFor()
  await until(async () => (await card.innerText()).includes(cwd), 'environment follows selected workspace')
  await page.screenshot({ path: join(run, 'environment-card.png') })
  await card.getByRole('button', { name: 'Desktop pet', exact: true }).click()
  await until(() => application.windows().some(p => p.url().includes('/api/nidofy-extras/ui')), 'pet settings shortcut')
  const ui = application.windows().find(p => p.url().includes('/api/nidofy-extras/ui'))
  await ui.locator('#showpet').waitFor()
  await ui.locator('#showpet').click()
  await until(() => application.windows().some(p => p.url().includes('/assets/pet/index.html')), 'one-click pet window')
  const pet = application.windows().find(p => p.url().includes('/assets/pet/index.html'))
  await until(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(w => w.webContents.getURL().includes('/assets/pet/index.html') && w.isVisible())), 'decoded pet visible')
  await pet.screenshot({ path: join(run, 'pet-shown-by-ui.png') })
  await ui.locator('#hidepets').click()
  await until(() => !application.windows().some(p => p.url().includes('/assets/pet/index.html')), 'hide all pets')
  await ui.locator('#addinstance').click()
  await until(() => application.windows().filter(p => p.url().includes('/assets/pet/index.html')).length === 2, 'adding a pet starts the service')
  await ui.locator('#removeinstance').click()
  await until(() => application.windows().filter(p => p.url().includes('/assets/pet/index.html')).length === 1, 'remove extra instance')
  await ui.locator('#hidepets').click()
  await until(() => !application.windows().some(p => p.url().includes('/assets/pet/index.html')), 'hide after adding')
  result.checks.showAndHidePetByVisibleControls = true
  const resize = async (target, width) => application.evaluate(({ BrowserWindow }, { url, width }) => {
    const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === url)
    window.setSize(width, 700)
  }, { url: target.url(), width })
  const verifyLayout = async (target, tabs, prefix) => {
    for (const width of [1100, 520, 800, 520]) {
      await resize(target, width)
      for (const tab of tabs) {
        await target.locator('[data-tab="' + tab + '"]').click()
        await target.waitForTimeout(80)
        const overflow = await target.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
          escaped: [...document.querySelectorAll('button,input,select,textarea')].filter(el => el.getClientRects().length && (el.getBoundingClientRect().right > innerWidth + 1 || el.getBoundingClientRect().left < -1)).map(el => el.id || el.textContent) }))
        assert.ok(overflow.scroll <= overflow.width + 1, JSON.stringify({ prefix, width, tab, overflow }))
        assert.deepEqual(overflow.escaped, [], JSON.stringify({ prefix, width, tab, overflow }))
        if (width === 520) await target.screenshot({ path: join(run, `${prefix}-${tab}-narrow.png`), fullPage: true })
      }
    }
  }
  await verifyLayout(ui, ['diagnostics', 'cache', 'vision', 'pets', 'schedule', 'selftest'], 'extras')
  await ui.goto('dsh-app://app/api/nidofy-extras/ui?locale=zh-CN')
  await ui.locator('#records table').waitFor()
  await verifyLayout(ui, ['diagnostics', 'cache', 'vision', 'pets', 'schedule', 'selftest'], 'extras-zh')
  await ui.close()
  await card.getByRole('button', { name: 'Build and test', exact: true }).click()
  await until(() => application.windows().some(p => p.url().includes('/api/nidofy/workbench/ui')), 'workbench shortcut')
  const workbench = application.windows().find(p => p.url().includes('/api/nidofy/workbench/ui'))
  await workbench.locator('#workspace').fill(cwd)
  await verifyLayout(workbench, ['environment', 'review', 'builds', 'artifacts', 'recovery', 'protection'], 'workbench')
  await workbench.goto('dsh-app://app/api/nidofy/workbench/ui?locale=zh-CN&workspace=' + encodeURIComponent(cwd))
  await verifyLayout(workbench, ['environment', 'review', 'builds', 'artifacts', 'recovery', 'protection'], 'workbench-zh')
  assert.ok(await workbench.locator('#gitFullAccess').evaluate(el => getComputedStyle(el).minWidth === '0px' || parseFloat(getComputedStyle(el).minWidth) < 30))
  await workbench.close()
  await card.getByRole('button', { name: 'Close', exact: true }).click()
  result.checks.environmentCardAndRepeatedTabResize = true
}
