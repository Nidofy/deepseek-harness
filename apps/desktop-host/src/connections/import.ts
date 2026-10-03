/** Copy-only legacy import. Official Session readers validate and upgrade only the private copy. */
import { Context } from '@deepseek-ai/cordis'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { writeFileAtomic, withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { load } from 'js-yaml'
import { object, profileFrom } from './store.ts'

const hash = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex')
type Inventory = Array<{ source: string; target: string; digest: string; bytes: number }>
async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
}
/** Reject every linked ancestor, including Windows junctions, before importing any data. */
async function plainPath(path: string): Promise<void> {
  const full = resolve(path)
  const parent = dirname(full)
  if (parent !== full) await plainPath(parent)
  const stat = await lstat(full)
  if (stat.isSymbolicLink()) throw new Error('IMPORT_LINK_REFUSED')
}
async function collect(source: string, target: string, inventory: Inventory): Promise<void> {
  if (!await exists(source)) return
  const stat = await lstat(source)
  if (stat.isSymbolicLink()) throw new Error('IMPORT_LINK_REFUSED')
  if (stat.isDirectory()) {
    for (const name of (await readdir(source)).sort()) await collect(join(source, name), join(target, name), inventory)
  } else if (stat.isFile()) {
    if (source.endsWith('.lock')) throw new Error('IMPORT_SOURCE_BUSY')
    if (stat.nlink !== 1 || stat.size > 512 * 1024 * 1024 || inventory.length >= 100_000) throw new Error('IMPORT_FILE_REFUSED')
    inventory.push({ source, target, digest: hash(await readFile(source)), bytes: stat.size })
  } else throw new Error('IMPORT_FILE_REFUSED')
}
function noSecrets(value: unknown): void {
  if (Array.isArray(value)) { for (const item of value) noSecrets(item); return }
  if (value === null || typeof value !== 'object') return
  for (const [key, item] of Object.entries(value)) {
    if (/^(apiKey|password|token|secret|authorization|headers)$/i.test(key)) throw new Error('IMPORT_INLINE_SECRET_REFUSED')
    noSecrets(item)
  }
}

/** Import into a new distribution data root; never replace or merge an active home.
 * @param input - Source directory, supported legacy desktop version and operation ID.
 * @param imports - Application-owned destination parent, separate from the source.
 * @param validateSetting - Official loaded-plugin schema validation without dropping unknown fields.
 * @param fault - Qualification interruption at copy, validation or publication stages.
 * @returns Ready receipt after all copies pass official readers, or rejects without publishing a home.
 */
export async function importLegacy(input: unknown, imports: string,
  validateSetting: (namespace: string, config: unknown) => void,
  fault: (point: string) => Promise<void> = () => Promise.resolve()) {
  const request = object(input)
  if (typeof request.source !== 'string' || !isAbsolute(request.source)
    || typeof request.operationId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(request.operationId)
    || !['0.2.0', '0.2.5-rc.1'].includes(String(request.sourceVersion))) throw new Error('IMPORT_REQUEST_INVALID')
  const source = await realpath(request.source)
  await plainPath(request.source)
  const root = resolve(imports)
  if (root === source || root.startsWith(source + sep) || source.startsWith(root + sep)) throw new Error('IMPORT_PATH_OVERLAP')
  await mkdir(root, { recursive: true, mode: 0o700 }); await plainPath(root)
  const operationId = request.operationId
  return withFileLock(join(root, 'owner'), async () => {
    const home = await exists(join(source, 'dsh')) ? join(source, 'dsh') : source
    for (const lock of ['settings.yaml.lock', 'settings.yaml.imported', 'profiles/dsh-desktop/lock', 'profiles/desktop/lock']) {
      if (await exists(join(home, lock))) throw new Error('IMPORT_SOURCE_BUSY')
    }
    const inventory: Inventory = []
    for (const name of ['sessions', 'attachments']) await collect(join(home, name), join('harness', name), inventory)
    for (const item of inventory) {
      const version = /session\.v(\d+)\.jsonl(?:\.zstd)?$/.exec(item.source)?.[1]
      if (version && Number(version) > SESSION_FORMAT_VERSION) throw new Error('IMPORT_SESSION_VERSION_UNSUPPORTED')
    }
    await collect(join(home, 'storages', 'workspace.json'), join('harness', 'storages', 'workspace.json'), inventory)
    await collect(join(home, 'desktop-snapshot-scopes.json'), join('harness', 'desktop-snapshot-scopes.json'), inventory)
    const configPaths = [join(source, 'connections.json'), join(source, 'connection.json'),
      join(home, 'settings.yaml'), join(home, 'profiles', 'desktop', 'cordis.patch.yml'), join(home, 'profiles', 'dsh-desktop', 'cordis.patch.yml')]
    const documents: Record<string, unknown> = {}
    const sources: Array<{ path: string; digest: string }> = []
    for (const path of configPaths) if (await exists(path)) {
      await plainPath(path)
      const stat = await lstat(path)
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > 2 * 1024 * 1024) throw new Error('IMPORT_SETTINGS_REFUSED')
      const bytes = await readFile(path)
      const value: unknown = path.endsWith('.json') ? JSON.parse(bytes.toString()) as unknown : load(bytes.toString())
      noSecrets(value); documents[path] = value; sources.push({ path, digest: hash(bytes) })
    }
    const connectionSuggestions: Array<{
      connection: string
      profile: ReturnType<typeof profileFrom>
      requiresKey: true
      pendingReview: unknown
    }> = []
    const catalog = documents[join(source, 'connections.json')]
    const legacy = documents[join(source, 'connection.json')]
    let profiles: unknown[] = []
    if (catalog !== undefined) {
      const parsed = object(catalog)
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.profiles) || parsed.profiles.length > 32) throw new Error('IMPORT_CONNECTION_VERSION_UNSUPPORTED')
      profiles = parsed.profiles
    } else if (legacy !== undefined) profiles = [{ id: 'legacy', connection: legacy }]
    for (const value of profiles) {
      const profile = object(value), connection = object(profile.connection)
      if (typeof profile.id !== 'string' || !/^(legacy|p-[a-f0-9]{32})$/.test(profile.id)) throw new Error('IMPORT_CONNECTION_ID_INVALID')
      const models: unknown = connection.models ?? [connection.model]
      if (!Array.isArray(models) || models.length === 0 || models.some(id => typeof id !== 'string')) throw new Error('IMPORT_MODELS_INVALID')
      const limits = connection.modelLimits === undefined ? {} : object(connection.modelLimits)
      const declarations = (models as string[]).map(id => ({ id, ...(limits[id] === undefined ? {} : object(limits[id])) }))
      if (connection.baseUrl !== undefined && typeof connection.baseUrl !== 'string') throw new Error('IMPORT_ENDPOINT_INVALID')
      if (connection.providerName !== undefined && typeof connection.providerName !== 'string') throw new Error('IMPORT_NAME_INVALID')
      const baseURL = (connection.baseUrl ?? '').replace(/\/$/, '')
      if (!baseURL) continue
      const converted = profileFrom({ displayName: connection.providerName ?? profile.id,
        api: connection.api ?? 'openai-completions', baseURL: connection.api === 'anthropic-messages' ? baseURL.replace(/\/v1$/, '') : baseURL,
        ...connection.builtinProvider ? { catalogProvider: connection.builtinProvider } : {}, models: declarations,
        timeoutMs: connection.timeoutMs ?? 300_000, streamIdleTimeoutMs: connection.streamIdleTimeoutMs ?? 300_000 })
      connectionSuggestions.push({ connection: profile.id, profile: converted, requiresKey: true,
        pendingReview: { network: profile.network, cache: connection.cache, modelCapabilities: connection.modelCapabilities } })
    }
    const patch: Array<{ id: string; config: unknown }> = []
    const legacySettings = documents[join(home, 'settings.yaml')]
    const patches = ['desktop', 'dsh-desktop'].map(name => documents[join(home, 'profiles', name, 'cordis.patch.yml')]).filter(value => value !== undefined)
    if (patches.length > 1) throw new Error('IMPORT_SETTINGS_AMBIGUOUS')
    const savedPatch = patches[0]
    if (legacySettings !== undefined && savedPatch !== undefined) throw new Error('IMPORT_SETTINGS_AMBIGUOUS')
    const aliases: Record<string, string> = { 'ui-developer-tools': 'ui-settings', 'ui-onboarding': 'ui-settings-general', shell: 'pwsh-sandbox' }
    const rows = legacySettings === undefined ? savedPatch ?? []
      : Object.entries(object(legacySettings)).map(([id, config]) => ({ id: aliases[id] ?? id, config }))
    if (!Array.isArray(rows)) throw new Error('IMPORT_SETTINGS_INVALID')
    for (const item of rows) {
      const row = object(item)
      if (typeof row.id !== 'string' || Object.keys(row).some(key => !['id', 'config'].includes(key))) throw new Error('IMPORT_PLUGIN_CODE_REFUSED')
      // Rebind every credential reference to an intentionally absent value in the new home.
      const rebind = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(rebind)
        if (value === null || typeof value !== 'object') return value
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
          /^(apiKeyEnv|credentialRef)$/i.test(key) ? `NIDOFY_IMPORT_${randomUUID().replaceAll('-', '_')}` : rebind(item)]))
      }
      const config = rebind(row.config)
      validateSetting(row.id, config)
      patch.push({ id: row.id, config })
    }
    const workspacePath = join(home, 'storages', 'workspace.json')
    if (await exists(workspacePath)) {
      const value = object(JSON.parse(await readFile(workspacePath, 'utf8')) as unknown)
      const unit = object(value.unit), globals = object(value.global), tables = object(value.tables)
      if (unit.name !== 'workspace' || unit.version !== 2 || globals.pendingMutation || !Array.isArray(globals.workspaceIds)) throw new Error('IMPORT_WORKSPACE_VERSION_UNSUPPORTED')
      const workspaces = object(tables.workspaces)
      if (globals.workspaceIds.some(id => typeof id !== 'string' || !Object.hasOwn(workspaces, id))) throw new Error('IMPORT_WORKSPACE_INVALID')
    }
    const fingerprint = hash(JSON.stringify({ source, sourceVersion: request.sourceVersion, inventory, sources }))
    const final = join(root, operationId), staging = join(root, `${operationId}.pending`)
    if (await exists(final)) {
      await plainPath(final)
      const receipt = object(JSON.parse(await readFile(join(final, 'import.json'), 'utf8')) as unknown)
      if (receipt.fingerprint !== fingerprint || receipt.status !== 'READY') throw new Error('IMPORT_CONFLICT')
      return receipt
    }
    await mkdir(staging, { recursive: true, mode: 0o700 }); await plainPath(staging)
    const journal = join(staging, 'import.json')
    if (await exists(journal)) {
      const prior = object(JSON.parse(await readFile(journal, 'utf8')) as unknown)
      if (prior.fingerprint !== fingerprint) throw new Error('IMPORT_SOURCE_CHANGED')
    }
    await writeFileAtomic(journal, JSON.stringify({ schemaVersion: 1, fingerprint, status: 'COPYING' }), { mode: 0o600 })
    for (const item of inventory) {
      const target = join(staging, item.target)
      if (relative(staging, target).startsWith('..')) throw new Error('IMPORT_PATH_ESCAPE')
      await mkdir(dirname(target), { recursive: true }); await plainPath(dirname(target)); await plainPath(item.source)
      if (await exists(target)) {
        await plainPath(target)
        if (hash(await readFile(target)) !== item.digest) throw new Error('IMPORT_COPY_CONFLICT')
      } else await copyFile(item.source, target, constants.COPYFILE_EXCL)
      if (hash(await readFile(item.source)) !== item.digest || hash(await readFile(target)) !== item.digest) throw new Error('IMPORT_SOURCE_CHANGED')
    }
    await fault('copied')
    // The isolated context contains only a persistence reader/writer, never an Agent or a second Host.
    const reader = new Context()
    let sessions = 0
    try {
      const sessionLogs = inventory.filter(item => item.target.startsWith(join('harness', 'sessions') + sep)
        && /session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/.test(item.source))
      const plain = sessionLogs.some(item => item.source.endsWith('.jsonl'))
      const compressed = sessionLogs.some(item => item.source.endsWith('.jsonl.zstd'))
      if (plain && compressed) throw new Error('IMPORT_MIXED_ENCODING_REFUSED')
      const compression = plain ? 'none' : 'zstd'
      const persistence = patch.find(row => row.id === 'session-persistence-jsonl')
      const copiedRoot = join(final, 'harness', 'sessions')
      if (persistence) persistence.config = { ...object(persistence.config), root: copiedRoot, compression }
      else patch.push({ id: 'session-persistence-jsonl', config: { root: copiedRoot, compression } })
      await reader.plugin(JsonlSessionPersistence, { root: join(staging, 'harness', 'sessions'), compression })
      const list = await reader.sessionPersistence.list()
      const expected = new Set(sessionLogs.map(item => dirname(item.source)))
      if (list.length !== expected.size) throw new Error('IMPORT_SESSION_UNREADABLE')
      for (const { header } of list) {
        const read = await reader.sessionPersistence.open(header.id, 'read')
        try { await read.read() } finally { await read.close() }
      }
      await fault('validated')
      for (const { header } of list) {
        const write = await reader.sessionPersistence.open(header.id, 'write')
        await write.close(); sessions++
      }
      await reader.sessionPersistence.flush()
    } finally { await reader.fiber.dispose() }
    // Source bytes are checked again after the official migration chain finishes.
    for (const item of inventory) if (hash(await readFile(item.source)) !== item.digest) throw new Error('IMPORT_SOURCE_CHANGED')
    for (const item of sources) if (hash(await readFile(item.path)) !== item.digest) throw new Error('IMPORT_SOURCE_CHANGED')
    const patchPath = join(staging, 'harness', 'profiles', 'desktop', 'cordis.patch.yml')
    await writeFileAtomic(patchPath, JSON.stringify(patch), { mode: 0o600 })
    await writeFileAtomic(join(staging, 'harness', 'nidofy-import-connections.json'), JSON.stringify(connectionSuggestions), { mode: 0o600 })
    const receipt = { schemaVersion: 1, operationId, fingerprint, status: 'READY', dataRoot: final,
      sourceVersion: request.sourceVersion, sessions, files: inventory.length, credentialsCopied: false,
      sourceModified: false, schedulesActivated: false, connectionSuggestions,
      exclusions: ['credentials', 'executable plugins', 'automation schedules', 'session query caches'], settings: patch.map(row => row.id) }
    await writeFileAtomic(journal, JSON.stringify(receipt), { mode: 0o600 })
    await fault('ready')
    await rename(staging, final)
    return receipt
  })
}
