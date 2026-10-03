/** Desktop endpoints run after official connection authentication and origin checks. */
import { resolveConfig } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-config-editor'
import type {} from '@deepseek-ai/dsh-client-connection'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { object } from './store.ts'
import { installConnections } from './runtime.ts'
import { importLegacy } from './import.ts'
import { connectionsHtml } from './ui.ts'
import { installProtection } from './protection.ts'
import { installWorkbench, WorkbenchCommandError } from '../workbench/owner.ts'
import { workbenchHtml } from '../workbench/ui.ts'

function plain(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && 'get' in value && typeof value.get === 'function') {
    const get = value.get as () => unknown
    return plain(get.call(value))
  }
  if (Array.isArray(value)) return value.map(plain)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]))
  return value
}
function keeps(before: unknown, after: unknown): boolean {
  if (Array.isArray(before)) return Array.isArray(after)
    && before.length === after.length && before.every((item, i) => keeps(item, after[i]))
  if (before !== null && typeof before === 'object') return after !== null && typeof after === 'object'
    && Object.entries(before).every(([key, item]) => Object.hasOwn(after, key) && keeps(item, Reflect.get(after, key)))
  return Object.is(before, after)
}

/** Mount the local editor and migration operations on the existing Host.
 * @param ctx - Authenticated official Host connection dispatcher.
 * @param home - Distribution-isolated Harness home.
 */
export async function installConnectionApi(ctx: Context, home: string): Promise<void> {
  const store = await installConnections(ctx, join(home, 'nidofy-connections'))
  const protection = installProtection(ctx, home, process.env.DSH_DESKTOP_PROTECTION_HELPER ?? '')
  const workbench = installWorkbench(ctx, protection, home)
  let importedConnections: unknown = []
  try { importedConnections = JSON.parse(await readFile(join(home, 'nidofy-import-connections.json'), 'utf8')) as unknown }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const validate = (namespace: string, config: unknown): void => {
    const row = ctx.configEditor.configuration().find(item => item.entry.options.id === namespace)
    const runtime = row?.entry.fiber?.runtime
    if (!runtime?.Config || namespace === 'schedule') throw new Error('IMPORT_SETTINGS_UNSUPPORTED')
    const result: unknown = resolveConfig(runtime, config)
    if (!keeps(config, plain(result))) throw new Error('IMPORT_SETTINGS_UNSUPPORTED')
  }
  ctx.on('connection/request', async (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith('/api/nidofy/')) return next()
    response.setHeader('cache-control', 'no-store')
    if (url.pathname === '/api/nidofy/workbench/ui' && request.method === 'GET') {
      response.setHeader('content-type','text/html; charset=utf-8')
      response.end(workbenchHtml(url.searchParams.get('locale') === 'zh-CN')); return
    }
    if (url.pathname === '/api/nidofy/workbench/artifact/download' && request.method === 'GET') {
      try { await workbench.download(url.searchParams.get('id') ?? '',response) }
      catch (_error) { if (!response.headersSent) {response.writeHead(400);response.end('ARTIFACT_NOT_CONFIRMED')} else response.destroy() }
      return
    }
    if (url.pathname === '/api/nidofy/ui' && request.method === 'GET') {
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end(connectionsHtml(url.searchParams.get('locale') === 'zh-CN')); return
    }
    response.setHeader('content-type', 'application/json')
    if (request.method !== 'POST') { response.writeHead(405); response.end('{}'); return }
    try {
      const chunks: Buffer[] = []; let size = 0
      for await (const chunk of request) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
        size += bytes.length
        if (size > 2 * 1024 * 1024) throw new Error('REQUEST_TOO_LARGE')
        chunks.push(bytes)
      }
      const data = object(JSON.parse(Buffer.concat(chunks).toString()) as unknown)
      if (url.pathname.startsWith('/api/nidofy/workbench/')) {
        response.end(JSON.stringify(await workbench.request(url.pathname.slice('/api/nidofy/workbench/'.length),data))); return
      }
      let result: unknown
      switch (url.pathname) {
        case '/api/nidofy/status': result = { ...await store.inspect(typeof data.operationId === 'string' ? data.operationId : undefined), importedConnections }; break
        case '/api/nidofy/mutate': result = await store.mutate(data); break
        case '/api/nidofy/collect': await store.collect(); result = store.status(); break
        case '/api/nidofy/import': result = await importLegacy(data, join(home, '..', 'imports'), validate); break
        case '/api/nidofy/protection': result = await protection.configure(data); break
        default: response.writeHead(404); response.end('{}'); return
      }
      response.end(JSON.stringify(result))
    } catch (error) {
      const ownCode: unknown = error instanceof Error ? Reflect.get(error, 'code') : undefined
      const message = typeof ownCode === 'string' ? ownCode : error instanceof Error ? error.message : ''
      const code = /^[A-Z][A-Z0-9_]+$/.test(message) ? message : 'OPERATION_NOT_CONFIRMED'
      response.writeHead(code.includes('CONFLICT') ? 409 : 400)
      response.end(JSON.stringify({ error: code, ...(error instanceof WorkbenchCommandError ? { detail: error.detail } : {}) }))
    }
  })
}
