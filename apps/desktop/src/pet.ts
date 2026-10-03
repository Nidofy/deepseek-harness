/** Native window authority for plugin-owned pets; the Host owns model and Session state. */
import { app, BrowserWindow, ipcMain, net, screen } from 'electron'
import type { IpcMainInvokeEvent, Rectangle, Point } from 'electron'
interface PetWindow {
  window: BrowserWindow
  snapshot: Record<string, unknown>
  scale: number
  bubble: number
  menuOpen: boolean
  menuOffset: number
  drag?: { point: Point
    bounds: Rectangle }
}
/** Dispose every optional window, timer and IPC handler when Desktop exits. */
export function installPetDesktop(preload: string, backend: () => { url: string; cookie: string }, focusMain: () => void): () => void {
  const windows = new Map<string, PetWindow>(), controller = new AbortController()
  let polling = false
  async function rpc(method: string, body: object = {}): Promise<Record<string, unknown>> {
    const host = backend(), url = new URL('/api/nidofy-extras/' + method, host.url)
    const response = await net.fetch(url.toString(), { method: 'POST', headers: { origin: url.origin, cookie: host.cookie, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) })
    if (!response.ok) throw Error('PET_PLUGIN_UNAVAILABLE')
    const value: unknown = await response.json()
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw Error('PET_INVALID_STATE')
    return value as Record<string, unknown>
  }
  function close(id: string): void { const row = windows.get(id); windows.delete(id); row?.window.destroy() }
  function admit(event: IpcMainInvokeEvent): [string, PetWindow] {
    for (const [id, row] of windows) {
      if (event.sender === row.window.webContents && event.senderFrame === event.sender.mainFrame
        && event.senderFrame.url.startsWith('dsh-app://app/api/nidofy-extras/assets/pet/')) return [id, row]
    }
    throw Error('PET_SENDER_REFUSED')
  }
  function place(bounds: Rectangle): Rectangle {
    const area = screen.getDisplayMatching(bounds).workArea
    return { ...bounds, x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width)),
      y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height)) }
  }
  function resize(row: PetWindow): void {
    if (row.drag) return
    const current = row.window.getBounds(), width = Math.ceil(240 * row.scale)
    const pet = place({ x: current.x + row.menuOffset, y: current.y,
      width, height: Math.ceil((208 + row.bubble) * row.scale) })
    const area = screen.getDisplayMatching(pet).workArea
    const left = row.menuOpen && area.x + area.width - pet.x - width < 220
    row.menuOffset = left ? 220 : 0
    row.window.setBounds(place({ ...pet, x: pet.x - row.menuOffset,
      width: width + (row.menuOpen ? 220 : 0), height: row.menuOpen ? Math.max(208, pet.height) : pet.height }))
    row.window.webContents.send('nidofy:pet-event', 'pet-layout', { open: row.menuOpen, side: left ? 'left' : 'right', width })
  }
  async function poll(): Promise<void> {
    if (controller.signal.aborted || polling) return
    polling = true
    try {
      const state = await rpc('status'), p = state.preferences as Record<string, unknown> | undefined
      controller.signal.throwIfAborted()
      const companions: unknown[] = Array.isArray(p?.companions) ? p.companions : []
      const instances = p?.pets && (state.features as Record<string, unknown>).pets === 'ENABLED'
        ? [p.pet, ...companions].slice(0, 3) as Array<Record<string, unknown>> : []
      const active = new Set(instances.filter(p => p.enabled !== false).map(p => String(p.id)))
      for (const id of windows.keys()) if (!active.has(id)) close(id)
      for (const [index, settings] of instances.entries()) {
        const id = String(settings.id)
        if (!active.has(id)) continue
        const snapshot = await rpc('pet/snapshot', { id })
        controller.signal.throwIfAborted()
        let row = windows.get(id)
        if (!row) {
          const area = screen.getPrimaryDisplay().workArea, position = settings.position as Point | null
          const bounds = place({ x: position?.x ?? area.x + area.width - 260 * (index + 1),
            y: position?.y ?? area.y + area.height - 260, width: 240, height: 208 })
          const window = new BrowserWindow({ ...bounds, frame: false, transparent: true, show: false,
            alwaysOnTop: true, skipTaskbar: true, resizable: false,
            webPreferences: { preload, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } })
          row = { window, snapshot, scale: Number(settings.scale), bubble: 0, menuOpen: false, menuOffset: 0 }; windows.set(id, row)
          window.on('blur', () => {
            const current = windows.get(id)
            if (current?.window === window && current.menuOpen && !window.isDestroyed()) {
              current.menuOpen = false; resize(current)
            }
          })
          window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
          window.webContents.on('will-navigate', (event) =>{  event.preventDefault() })
          window.on('closed', () => { if (windows.get(id)?.window === window) windows.delete(id) })
          await window.loadURL('dsh-app://app/api/nidofy-extras/assets/pet/index.html?id=' + encodeURIComponent(id))
        }
        controller.signal.throwIfAborted()
        if (row.window.isDestroyed()) continue
        row.snapshot = snapshot; row.scale = Number(settings.scale); resize(row)
        row.window.webContents.send('nidofy:pet-event', 'pet-settings', snapshot.settings)
        row.window.webContents.send('nidofy:pet-event', 'pet-state', snapshot.state)
      }
    } catch { for (const id of windows.keys()) close(id) } finally { polling = false }
  }
  ipcMain.handle('nidofy:pet', async (event, method: unknown, input: unknown) => {
    const [id, row] = admit(event)
    if (method === 'pet_snapshot') return row.snapshot
    if (method === 'pet_resource') return rpc('pet/resource', { id })
    const data = input !== null && typeof input === 'object' ? input as Record<string, unknown> : {}
    if (method === 'pet_ready') { if (data.decoded === true) row.window.showInactive(); return }
    if (method !== 'pet_action' || typeof data.action !== 'string') throw Error('PET_ACTION_REFUSED')
    const target = data.target !== null && typeof data.target === 'object' ? data.target as Record<string, unknown> : {}
    if (data.action === 'menu') {
      if (typeof target.open !== 'boolean') throw Error('PET_MENU_REFUSED')
      row.menuOpen = target.open; resize(row); return
    }
    if (data.action === 'bubble-size') {
      if (!Number.isInteger(target.height) || Number(target.height) < 0 || Number(target.height) > 160) throw Error('PET_BUBBLE_REFUSED')
      row.bubble = Number(target.height); resize(row); return
    }
    if (data.action === 'drag') {
      if (row.menuOpen) throw Error('PET_MENU_OPEN')
      const bounds = row.window.getBounds(), x = Number(target.x), y = Number(target.y)
      if (![x, y].every(v => Number.isFinite(v) && v >= 0 && v <= 4096)) throw Error('PET_DRAG_REFUSED')
      row.drag = { point: { x: bounds.x + x, y: bounds.y + y }, bounds }; return
    }
    if (data.action === 'drag-move' && row.drag) {
      const point = screen.getCursorScreenPoint()
      row.window.setBounds(place({ ...row.drag.bounds, x: row.drag.bounds.x + point.x - row.drag.point.x,
        y: row.drag.bounds.y + point.y - row.drag.point.y })); return
    }
    if (data.action === 'drag-end') {
      delete row.drag; resize(row)
      const { x, y } = row.window.getBounds(); return rpc('pet/update', { id, action: 'position', position: { x, y } })
    }
    const state = row.snapshot.state as { generation?: string; items?: Array<{ sessionId?: string }> }
    if (['navigate', 'pin'].includes(data.action) && (target.generation !== state.generation || !state.items?.some(r => r.sessionId === target.sessionId))) throw Error('PET_TARGET_CHANGED')
    if (data.action === 'navigate') { focusMain(); return { sessionId: target.sessionId } }
    if (['pin', 'unpin', 'hide', 'interact'].includes(data.action)) {
      await rpc('pet/update', { id, action: data.action, target })
      const snapshot = await rpc('pet/snapshot', { id })
      if (!row.window.isDestroyed()) {
        row.snapshot = snapshot
        row.window.webContents.send('nidofy:pet-event', 'pet-settings', snapshot.settings)
        row.window.webContents.send('nidofy:pet-event', 'pet-state', snapshot.state)
      }
      await poll(); return snapshot
    }
    throw Error('PET_ACTION_REFUSED')
  })
  const timer = setInterval(() => { void poll() }, 1500)
  const dispose = (): void => { controller.abort(); clearInterval(timer); for (const id of windows.keys()) close(id); ipcMain.removeHandler('nidofy:pet') }
  app.once('will-quit', dispose)
  return dispose
}
