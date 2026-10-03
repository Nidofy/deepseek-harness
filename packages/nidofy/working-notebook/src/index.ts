/** Independently enabled working notes over official Session, prompt and compaction services. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { join } from 'node:path'
import { installContext } from '@nidofy/dsh-desktop-extras/context'
import { installNotebookCompaction } from '@nidofy/dsh-desktop-extras/compaction'
import { NotebookSettingsStore } from './settings.ts'

export const name = 'nidofy-working-notebook'
export const inject = ['connection', 'tools', 'sessionQuery', 'sessions', 'systemPrompt']
/** Notebook bounds and the initial enhancement choice before a saved preference exists. */
export interface Config {
  /** Maximum note entries, including retired entries. */
  maxEntries: number
  /** Maximum serialized note snapshot and summary appendix bytes. */
  maxBytes: number
  /** Initial profile-wide enhancement choice before the first saved UI preference. */
  autoOrganize: boolean
}
export const Config: z<Config> = z.object({
  maxEntries: z.number().step(1).min(1).max(256).default(64),
  maxBytes: z.number().step(1).min(1024).max(65536).default(16384),
  autoOrganize: z.boolean().default(false),
})
/** Mount tools, note snapshots, optional summaries and authenticated local UI requests. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  // Keep the original note location so existing revisions need no migration.
  const home = join(resolveDshHome(), 'nidofy-extras', 'notebooks')
  const settings = new NotebookSettingsStore(home, config.autoOrganize)
  await settings.open()
  ctx.effect(() => () => settings.close())
  const context = installContext(ctx, home, config)
  installNotebookCompaction(ctx, () => ({ enabled: settings.value.autoOrganize, revision: settings.value.revision }))
  ctx.on('connection/request', async (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const prefix = ['/api/nidofy-notebook/', '/api/nidofy-extras/context/'].find(value => url.pathname.startsWith(value))
    if (!prefix) return next()
    response.setHeader('cache-control', 'no-store')
    response.setHeader('content-type', 'application/json')
    if (request.method !== 'POST') { response.writeHead(405); response.end('{}'); return }
    try {
      const chunks: Buffer[] = []; let size = 0
      for await (const chunk of request) {
        const value: unknown = chunk
        if (typeof value !== 'string' && !(value instanceof Uint8Array)) throw Error('NOTEBOOK_INVALID_REQUEST')
        const bytes = Buffer.from(value); size += bytes.length
        if (size > 128 * 1024) throw Error('NOTEBOOK_REQUEST_TOO_LARGE')
        chunks.push(bytes)
      }
      const raw: unknown = JSON.parse(Buffer.concat(chunks).toString())
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('NOTEBOOK_INVALID_REQUEST')
      const input = raw as Record<string, unknown>, method = url.pathname.slice(prefix.length)
      const result = method === 'settings' ? { ...settings.value }
        : method === 'save-settings' ? await settings.save(input)
          : await context(method, input)
      response.end(JSON.stringify(result))
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      response.writeHead(message.endsWith('CONFLICT') ? 409 : 400)
      response.end(JSON.stringify({ error: /^[A-Z][A-Z0-9_]+$/.test(message) ? message : 'NOTEBOOK_OPERATION_FAILED' }))
    }
  })
}
