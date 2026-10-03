/** Exercise the real packaged Host, composer, Electron IPC and native helper in a private fixture. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export async function qualify({ application, page, managed, rpc, until, promptAndVerify, sessionId, cwd, run, result, invokeAction }) {
  const git = (...args) => execFileSync('git', args, { cwd, windowsHide: true, encoding: 'utf8' }).trim()
  const api = (method, data = {}, status = 200) => managed(page, 'workbench/' + method, { workspace: cwd, ...data }, status)
  git('init'); git('config', 'user.name', 'M3 Fixture'); git('config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(cwd, 'review.txt'), 'original\n')
  git('add', '.'); git('commit', '-m', 'fixture baseline')
  const originalBranch = git('branch', '--show-current')
  const preview = await api('git/preview', { operation: { action: 'create', branch: 'm3-engineering' } })
  await api('git/apply', { token: preview.token })
  assert.equal(git('branch', '--show-current'), 'm3-engineering')
  await api('git/apply', { token: preview.token }, 400)
  const stale = await api('git/preview', { operation: { action: 'switch', branch: originalBranch } })
  writeFileSync(join(cwd, 'review.txt'), 'original\npreexisting edit\n')
  await api('git/apply', { token: stale.token }, 400)
  const before = await api('review/capture')
  writeFileSync(join(cwd, 'review.txt'), 'original\npreexisting edit\ntask edit\n')
  const changes = await api('review/changes', { baselineId: before.id })
  assert.ok(changes.rows.some(row => row.path === 'review.txt' && row.classification === 'DURING_TASK' && row.preexisting))
  const patch = await api('review/patch', { path: 'review.txt', mode: 'task', baselineId: before.id })
  assert.match(patch.text, /task edit/)
  git('add', 'review.txt')
  writeFileSync(join(cwd, 'unstaged.txt'), 'must remain uncommitted')
  const commit = await api('git/preview', { operation: { action: 'commit', message: 'M3 staged-only' } })
  await api('git/apply', { token: commit.token })
  assert.equal(git('log', '-1', '--format=%s'), 'M3 staged-only')
  assert.equal(git('ls-files', 'unstaged.txt'), '')
  const bare = join(cwd, '.fixture-remote.git'); mkdirSync(bare)
  execFileSync('git', ['init', '--bare', bare], { windowsHide: true })
  writeFileSync(join(cwd, '.git/info/exclude'), '.fixture-remote.git/\n')
  git('remote', 'add', 'fixture', bare)
  const confinedPush = await api('git/preview', { operation: { action: 'push', remote: 'fixture' } })
  await api('git/apply', { token: confinedPush.token }, 400)
  const push = await api('git/preview', { operation: { action: 'push', remote: 'fixture', fullAccess: true } })
  assert.equal(push.permission, 'danger-full-access')
  await api('git/apply', { token: push.token })
  assert.match(git('ls-remote', 'fixture', 'refs/heads/m3-engineering'), /^[a-f0-9]{40}/)
  assert.ok(await api('compare', { branch: originalBranch }))
  result.checks.gitOfficialShellPreviewCommitPush = true

  // Open the actual menu destination; no test-only production routes or globals.
  await application.evaluate(({ Menu }) => {
    globalThis.m3Popup = Menu.prototype.popup
    Menu.prototype.popup = function () {
      const find = items => { for (const item of items) { if (item.label === 'Engineering workbench') return item; const child = item.submenu && find(item.submenu.items); if (child) return child } }
      const item = find(this.items)
      if (!item) throw Error('Workbench menu missing')
      item.click()
    }
  })
  const opening = application.waitForEvent('window')
  await page.getByText('Application', { exact: true }).click()
  const workbench = await opening
  await application.evaluate(({ Menu }) => { Menu.prototype.popup = globalThis.m3Popup; delete globalThis.m3Popup })
  const pageErrors = []; workbench.on('pageerror', error => pageErrors.push(String(error)))
  await workbench.waitForURL('**/api/nidofy/workbench/ui**')
  await workbench.locator('#workspace').fill(cwd)
  await workbench.locator('#refresh').click()
  await until(async () => (await workbench.locator('#repoInfo').innerText()).includes('m3-engineering'), 'workbench repository')
  await rpc(page, 'session', 'rename', { request: { sessionId, title: 'M3 composer target' } })
  await page.reload()
  await page.getByText('Ungrouped', { exact: true }).click()
  await page.locator(`[data-row-key="session:${sessionId}"]`).click()
  const editor = page.locator('[contenteditable="true"]').first()
  await editor.fill('Keep my existing draft. ')
  await workbench.locator('[data-tab="review"]').click()
  await workbench.locator('#baseline').selectOption(before.id)
  await workbench.locator('#mode').selectOption('task')
  await workbench.locator('#file').fill('review.txt')
  await workbench.locator('#showPatch').click()
  await until(async () => (await workbench.locator('#patch').inputValue()).includes('task edit'), 'visible selected patch')
  await workbench.locator('#composers').click()
  await until(async () => (await workbench.locator('#composer').textContent()).includes(sessionId), 'resident official composer')
  const option = await workbench.locator('#composer option').evaluateAll((rows, id) => rows.find(row => row.textContent.includes(id))?.value, sessionId)
  await workbench.locator('#composer').selectOption(option)
  await workbench.locator('#patch').evaluate(element => element.setSelectionRange(0, element.value.length))
  await workbench.locator('#append').click()
  await until(async () => (await workbench.locator('#draftResult').innerText()).includes('APPENDED'), 'draft append acknowledgement')
  assert.match(await editor.innerText(), /Keep my existing draft\./)
  assert.match(await editor.innerText(), /task edit/)
  // Discovery revision is now stale: it cannot append a second copy.
  const appended = await editor.innerText()
  await workbench.locator('#append').click()
  await until(async () => (await workbench.locator('#draftResult').innerText()).includes('REFUSED'), 'stale draft refused')
  assert.equal(await editor.innerText(), appended)
  result.checks.realMenuReviewComposerAppendPreservesDraft = true
  await workbench.evaluate(() => window.scrollTo(0, 0))
  await workbench.screenshot({ path: join(run, 'workbench-review.png'), fullPage: true })

  const scopes = await managed(page, 'protection', { action: 'scopes' })
  await managed(page, 'protection', { action: 'arm', workspace: cwd, paths: ['protected.txt'], revision: scopes.revision })
  const protectedBefore = readFileSync(join(cwd, 'protected.txt'), 'utf8')
  const config = { schemaVersion: 1, actions: [
    { id: 'build', label: 'Build fixture', commands: { win32: "Set-Content -LiteralPath 'protected.txt' -Value 'built'; Set-Content -LiteralPath 'report.txt' -Value 'M3 artifact'; Write-Output 'M3 build log'", linux: 'false', darwin: 'false' }, artifacts: ['report.txt'], timeoutMs: 30000 },
    { id: 'slow', label: 'Cancel fixture', command: "Set-Content -LiteralPath 'slow-started.txt' -Value 'started'; Start-Sleep -Seconds 25; Set-Content -LiteralPath 'should-not-exist.txt' -Value 'bad'", timeoutMs: 40000 },
    { id: 'timeout', label: 'Timeout fixture', command: 'Start-Sleep -Seconds 25', timeoutMs: 1000 },
  ] }
  let actions = await api('actions/save', { config })
  await api('actions/start', { id: 'build' }, 400)
  await api('actions/trust', { fingerprint: actions.fingerprint })
  const build = await api('actions/start', { id: 'build' })
  let done
  await until(async () => { done = (await api('actions/inspect')).runs.find(row => row.id === build.id); return done && !['QUEUED', 'RUNNING'].includes(done.status) }, 'official shell build')
  assert.equal(done.status, 'PASS', JSON.stringify(done))
  assert.match((await api('actions/log', { id: build.id })).text, /M3 build log/)
  const snapshots = await managed(page, 'protection', { action: 'list' })
  const snapshot = snapshots.items.find(row => row.binding?.sessionId?.startsWith('workbench-')) || snapshots.items.at(-1)
  let restore
  for (const item of snapshots.items) {
    const candidate = await managed(page, 'protection', { action: 'preview', id: item.id })
    if (candidate.rows?.some(row => row.status === 'READY')) { restore = { id: item.id, value: candidate }; break }
  }
  assert.ok(restore, JSON.stringify(snapshots))
  await managed(page, 'protection', { action: 'restore', id: restore.id, expectedRevision: 'stale', paths: ['protected.txt'] }, 409)
  await managed(page, 'protection', { action: 'restore', id: restore.id, expectedRevision: restore.value.revision, paths: ['protected.txt'] })
  assert.equal(readFileSync(join(cwd, 'protected.txt'), 'utf8'), protectedBefore)
  const slow = await api('actions/start', { id: 'slow' })
  await until(async () => (await api('actions/inspect')).runs.find(row => row.id === slow.id)?.status === 'RUNNING', 'cancelable build running')
  await until(async () => existsSync(join(cwd, 'slow-started.txt')), 'cancelable child really started')
  await api('actions/cancel', { id: slow.id })
  await until(async () => !['QUEUED', 'RUNNING'].includes((await api('actions/inspect')).runs.find(row => row.id === slow.id)?.status), 'cancelled command exited')
  assert.equal(existsSync(join(cwd, 'should-not-exist.txt')), false)
  const timeout = await api('actions/start', { id: 'timeout' })
  let timed
  await until(async () => { timed = (await api('actions/inspect')).runs.find(row => row.id === timeout.id); return !['QUEUED', 'RUNNING'].includes(timed?.status) }, 'timeout child exits')
  assert.equal(timed.status, 'TIMEOUT', JSON.stringify(timed))
  result.checks.buildTrustOfficialShellCancelNativeRestore = true

  const manual = await api('artifacts/register', { path: 'report.txt' })
  const artifacts = await api('artifacts/list', { sessionId })
  assert.ok(artifacts.some(row => row.source === 'build-declared' && row.freshlyProduced === false))
  assert.ok(artifacts.some(row => row.source === 'build-log' && row.available))
  const savePath = join(run, 'saved-report.txt')
  await application.evaluate(({ dialog, shell }, path) => {
    globalThis.m3Native = { save: dialog.showSaveDialog, open: shell.openPath, reveal: shell.showItemInFolder, calls: [] }
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
    shell.openPath = async path => { globalThis.m3Native.calls.push(['open', path]); return '' }
    shell.showItemInFolder = path => { globalThis.m3Native.calls.push(['reveal', path]) }
  }, savePath)
  try {
    for (const action of ['open', 'reveal', 'save']) {
      const value = await workbench.evaluate(({ id, action }) => window.nidofyWorkbench.artifact(id, action), { id: manual.id, action })
      assert.ok(value.accepted || value.saved)
    }
    assert.equal(readFileSync(savePath, 'utf8'), readFileSync(join(cwd, 'report.txt'), 'utf8'))
    assert.equal(await application.evaluate(() => globalThis.m3Native.calls.length), 2)
    writeFileSync(join(cwd, 'report.txt'), 'changed after lease')
    await assert.rejects(workbench.evaluate(id => window.nidofyWorkbench.artifact(id, 'open'), manual.id))
  } finally {
    await application.evaluate(({ dialog, shell }) => { dialog.showSaveDialog = globalThis.m3Native.save; shell.openPath = globalThis.m3Native.open; shell.showItemInFolder = globalThis.m3Native.reveal; delete globalThis.m3Native })
  }
  result.checks.nativeArtifactLeaseOpenRevealSaveAndRecheck = true
  const priorRuns = (await api('actions/inspect')).runs.length
  await application.evaluate(({ Notification, net }) => {
    globalThis.m3Notifications = { show: Notification.prototype.show, fetch: net.fetch, supported: Notification.isSupported(), calls: [], polls: [] }
    Notification.prototype.show = function () { globalThis.m3Notifications.calls.push(this.body) }
    net.fetch = async function (...args) {
      const response = await globalThis.m3Notifications.fetch.apply(this, args)
      if (String(args[0]).includes('/workbench/notifications')) globalThis.m3Notifications.polls.push({ status: response.status, rows: await response.clone().json() })
      return response
    }
  })
  await workbench.evaluate(() => window.nidofyWorkbench.notifications(true))
  await invokeAction()
  const modelRuns = (await api('actions/inspect')).runs
  assert.equal(modelRuns.length, priorRuns + 1)
  assert.ok(modelRuns.some(row => row.source === 'agent' && row.status === 'PASS'), JSON.stringify(modelRuns))
  const sessionFiles = await api('artifacts/list', { sessionId })
  assert.ok(sessionFiles.some(row => row.source === 'session-declared' && row.path === 'report.txt' && row.available && row.freshlyProduced === false))
  result.checks.officialPresentEventArtifactProjection = true
  result.checks.modelToolUsesOfficialSessionShellAndProtection = true
  const recovery = await api('recovery', { sessionId })
  assert.equal(recovery.status, 'COMPLETED', JSON.stringify(recovery))
  assert.equal(recovery.unconfirmedTools.length, 0)
  assert.equal(recovery.lastTool?.status, 'COMPLETED')
  assert.ok((await api('notifications')).some(row => row.sessionId === sessionId))
  try { await until(async () => application.evaluate((_electron, id) => globalThis.m3Notifications.calls.some(body => body.includes(id)), sessionId), 'native task notification') }
  catch (error) { result.notificationDiagnostic = await application.evaluate(() => ({ supported: globalThis.m3Notifications.supported, calls: globalThis.m3Notifications.calls, polls: globalThis.m3Notifications.polls })); throw error }
  await workbench.evaluate(() => window.nidofyWorkbench.notifications(false))
  await application.evaluate(({ Notification, net }) => { Notification.prototype.show = globalThis.m3Notifications.show; net.fetch = globalThis.m3Notifications.fetch; delete globalThis.m3Notifications })
  assert.ok((await api('review/list')).items.some(row => row.source === 'task' && row.sessionId === sessionId))
  result.checks.officialSessionRecoveryNotificationsAutomaticBaseline = true
  for (const tab of ['builds', 'artifacts', 'recovery', 'protection']) {
    await workbench.locator(`[data-tab="${tab}"]`).click()
    await workbench.evaluate(() => window.scrollTo(0, 0))
    await workbench.screenshot({ path: join(run, `workbench-${tab}.png`), fullPage: true })
  }
  assert.deepEqual(pageErrors, [])
  assert.equal(await workbench.locator('#notice').innerText(), '')
  result.checks.workbenchAllTabsRender = true
  await workbench.goto('dsh-app://app/api/nidofy/workbench/ui?locale=zh-CN')
  await workbench.getByRole('heading', { name: '工程工作台', exact: true }).waitFor()
  await workbench.locator('[data-tab="artifacts"]').click()
  await workbench.locator('#artifactSession').fill(sessionId)
  await workbench.locator('#loadArtifacts').click()
  await until(async () => (await workbench.locator('#artifactList').innerText()).includes('session-declared'), 'Chinese workbench session deliveries')
  await workbench.screenshot({ path: join(run, 'workbench-zh.png'), fullPage: true })
  result.checks.chineseWorkbenchAndSessionArtifacts = true
  await workbench.close()
}
