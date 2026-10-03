/** Native artifact actions revalidate a Host-owned lease before invoking Electron. */
import { ipcMain, dialog, shell, net, Notification } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { lstat, open } from 'node:fs/promises'
import { basename } from 'node:path'
/** Register derived-desktop file actions on the existing authenticated Host.
 * @param admit - Existing top-frame app sender check.
 * @param backend - Current Host URL and private cookie, never exposed to the renderer.
 * @returns Disposer for the IPC handlers.
 */
export function installWorkbenchDesktop(admit: (event: IpcMainInvokeEvent) => void, backend: () => {
  url: string
  cookie: string
}): () => void {
  const fetchHost = (path: string, init?: RequestInit): Promise<Response> => {
    const host = backend(), url = new URL(path, host.url)
    const headers = new Headers(init?.headers)
    headers.set('origin', url.origin)
    headers.set('cookie', host.cookie)
    return net.fetch(url.toString(), { ...init, headers, signal: AbortSignal.timeout(60000) })
  }
  ipcMain.handle('nidofy:artifact', async (event, id: unknown, action: unknown) => {
    admit(event)
    if (typeof id !== 'string' || id.length > 100 || !['open', 'reveal', 'save'].includes(String(action)))
      throw Error('ARTIFACT_REQUEST_INVALID')
    const response = await fetchHost('/api/nidofy/workbench/artifact/lease', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action }) })
    const value: unknown = await response.json()
    if (!response.ok || value === null || typeof value !== 'object' || !('target' in value) || !('fingerprint' in value) || typeof value.target !== 'string')
      throw Error('ARTIFACT_LEASE_REFUSED')
    const target = value.target, info = await lstat(target)
    if (!info.isFile() || info.isSymbolicLink() || [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(':') !== value.fingerprint)
      throw Error('ARTIFACT_CHANGED')
    if (action === 'reveal') {
      shell.showItemInFolder(target)
      return { accepted: true }
    }
    if (action === 'open') {
      const error = await shell.openPath(target)
      if (error)
        throw Error('ARTIFACT_OPEN_FAILED')
      return { accepted: true }
    }
    const selected = await dialog.showSaveDialog({ defaultPath: basename(target) })
    if (selected.canceled || !selected.filePath)
      return { cancelled: true }
    const download = await fetchHost('/api/nidofy/workbench/artifact/download?id=' + encodeURIComponent(id))
    if (!download.ok || !download.body)
      throw Error('ARTIFACT_DOWNLOAD_REFUSED')
    // Exclusive creation avoids replacing a file changed after the save dialog's overwrite check.
    const file = await open(selected.filePath, 'wx', 0o600), reader = download.body.getReader()
    let bytes = 0
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done)
          break
        bytes += chunk.value.byteLength
        if (bytes > 512 * 1024 * 1024)
          throw Error('ARTIFACT_TOO_LARGE')
        await file.writeFile(chunk.value)
      }
      if (bytes !== Number(download.headers.get('content-length')))
        throw Error('ARTIFACT_DOWNLOAD_INCOMPLETE')
      await file.sync()
    }
    finally {
      await reader.cancel()
      await file.close()
    }
    return { saved: true, bytes }
  })
  let lastNotification = 0
  let notificationsEnabled = false, polling = false
  let notificationEpoch = 0
  const seen = new Set<string>()
  ipcMain.handle('nidofy:notifications', async (event, enabled: unknown) => {
    admit(event)
    if (typeof enabled !== 'boolean') throw Error('NOTIFICATION_INVALID')
    notificationsEnabled = false
    const epoch = ++notificationEpoch
    seen.clear()
    if (!enabled) return
    const response = await fetchHost('/api/nidofy/workbench/notifications', { method: 'POST', body: '{}' })
    const rows: unknown = await response.json()
    if (!response.ok || !Array.isArray(rows)) throw Error('NOTIFICATION_UNAVAILABLE')
    for (const row of rows as unknown[]) if (typeof row === 'object' && row !== null && 'id' in row && typeof row.id === 'string') seen.add(row.id)
    if (epoch === notificationEpoch) notificationsEnabled = true
  })
  const timer = setInterval(() => {
    if (!notificationsEnabled || polling) return
    polling = true
    const epoch = notificationEpoch
    void (async () => {
      const response = await fetchHost('/api/nidofy/workbench/notifications', { method: 'POST', body: '{}' })
      const rows: unknown = await response.json()
      if (!response.ok || !Array.isArray(rows) || epoch !== notificationEpoch) return
      for (const row of rows as unknown[]) {
        if (typeof row !== 'object' || row === null || !('id' in row) || typeof row.id !== 'string' || seen.has(row.id)) continue
        seen.add(row.id)
        if ('sessionId' in row && typeof row.sessionId === 'string' && 'reason' in row && typeof row.reason === 'string' && Notification.isSupported()) {
          new Notification({ title: 'DSH · Session', body: `${row.sessionId.slice(0, 100)} · ${row.reason.slice(0, 60)}` }).show()
        }
      }
      if (seen.size > 300) {
        const retained = [...seen].slice(-100)
        seen.clear()
        for (const id of retained) seen.add(id)
      }
    })().catch(() => { /* A disconnected Host cannot establish a new completion. */ }).finally(() => { polling = false })
  }, 3000)
  timer.unref()
  ipcMain.handle('nidofy:notify', (event, title: unknown, body: unknown) => {
    admit(event)
    if (typeof title !== 'string' || typeof body !== 'string' || title.length > 120 || body.length > 300)
      throw Error('NOTIFICATION_INVALID')
    if (Date.now() - lastNotification < 1000)
      return
    lastNotification = Date.now()
    if (Notification.isSupported())
      new Notification({ title, body }).show()
  })
  return () => { clearInterval(timer); notificationsEnabled = false; notificationEpoch++; ipcMain.removeHandler('nidofy:artifact'); ipcMain.removeHandler('nidofy:notify'); ipcMain.removeHandler('nidofy:notifications') }
}
