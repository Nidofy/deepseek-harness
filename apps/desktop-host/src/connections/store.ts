/** Single-owner connection publication with a credential-free recovery journal. */
import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, unlink, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic, withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { Config, resolveProfiles } from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'

/** Immutable managed connection revision identifier. */
export type RevisionId = Branded<'NidofyConnectionRevision'>
/** Connection editor publication operation identifier. */
export type OperationId = Branded<'NidofyConnectionOperation'>
/** Connection facts persisted independently of the secret value. */
export interface Revision {
  id: RevisionId
  connection: string
  createdAt: number
  profile: PiAiProviderProfile
  credential: string
  policyRevision: number
  transportLease: 'host-network-v1'
}
/** Committed route selection and retained revisions; keys never enter this document. */
export interface ConnectionState {
  schemaVersion: 1
  revision: number
  current: Record<string, RevisionId>
  revisions: Revision[]
  revoked: string[]
  operations: OperationId[]
}
/** Official credential service operations required by the transaction owner. */
export interface SecretStore {
  get(ref: string): Promise<string | undefined>
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
}
const empty = (): ConnectionState => ({ schemaVersion: 1, revision: 0, current: {}, revisions: [], revoked: [], operations: [] })
const idPattern = /^[a-z][a-z0-9-]{0,63}$/
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Refuse non-object wire data before accessing fields.
 * @param value - Parsed wire or durable JSON value.
 * @returns Object fields or a validation error.
 */
export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_OBJECT')
  return value as Record<string, unknown>
}
/** Validate connection facts using the same schema and catalog as the upstream adapter.
 * @param value - User-supplied connection profile, excluding secrets and transport changes.
 * @returns Normalized profile that can be persisted and reopened.
 */
export function profileFrom(value: unknown): PiAiProviderProfile {
  const raw = object(value)
  const allowed = new Set(['catalogProvider', 'displayName', 'api', 'baseURL', 'models', 'modelOverrides', 'compat',
    'defaultContextWindow', 'defaultMaxTokens', 'defaultInput', 'reasoning', 'thinkingBudgets', 'cacheRetention',
    'timeoutMs', 'streamIdleTimeoutMs', 'retryPolicy'])
  if (Object.keys(raw).some(key => !allowed.has(key))) throw new Error('UNSUPPORTED_CONNECTION_FIELD')
  if (raw.api !== undefined && raw.api !== 'openai-completions' && raw.api !== 'anthropic-messages') throw new Error('UNSUPPORTED_PROTOCOL')
  if (raw.baseURL !== undefined) {
    if (typeof raw.baseURL !== 'string') throw new Error('INVALID_ENDPOINT')
    const url = new URL(raw.baseURL)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error('INVALID_ENDPOINT')
  }
  const parsed = structuredClone(Config({ providers: { 'nidofy-validation': raw } })
    .providers.get()['nidofy-validation']) as PiAiProviderProfile | undefined
  if (parsed === undefined) throw new Error('INVALID_PROFILE')
  // An explicit managed ref prevents catalog-native ambient authentication.
  resolveProfiles({ 'nidofy-validation': { ...parsed, apiKeyEnv: 'NIDOFY_VALIDATION' } })
  return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => allowed.has(key) && value !== undefined))
}

/** Owns durable publication; adapter leases use the exact Revision objects returned here. */
export class ConnectionStore {
  readonly hostEpoch = brandString<Branded<'NidofyHostEpoch'>>(randomUUID())
  state: ConnectionState = empty()
  appliedRevision = 0
  private tail: Promise<void> = Promise.resolve()
  private readonly counts = new Map<string, number>()
  private readonly keys = new Map<string, string>()
  private stopped = false

  constructor(readonly directory: string, private readonly secrets: SecretStore,
    private readonly publish: (state: ConnectionState) => void,
    readonly retentionMs = 60_000,
    private readonly fault: (point: string) => Promise<void> = () => Promise.resolve()) {}

  /** Recover a killed writer before making any managed provider visible. */
  async open(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    await this.exclusive(async () => { await this.recover(); await this.apply() })
  }

  private async read(name: string): Promise<unknown> {
    const path = join(this.directory, name)
    try {
      const stat = await lstat(path)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024) throw new Error('INVALID_CONNECTION_FILE')
      return JSON.parse(await readFile(path, 'utf8')) as unknown
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
  }

  private decode(raw: unknown): ConnectionState {
    const value = object(raw)
    if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0
      || !Array.isArray(value.revisions) || !Array.isArray(value.revoked) || !Array.isArray(value.operations)) throw new Error('CONNECTION_SCHEMA_UNSUPPORTED')
    const current = object(value.current)
    const revisions = value.revisions.map((item) => {
      const row = object(item)
      if (typeof row.id !== 'string' || !uuid.test(row.id) || typeof row.connection !== 'string' || !idPattern.test(row.connection)
        || typeof row.credential !== 'string' || row.credential !== `NIDOFY_REV_${row.id.replaceAll('-', '_')}`
        || typeof row.createdAt !== 'number' || !Number.isSafeInteger(row.policyRevision)
        || row.transportLease !== 'host-network-v1') throw new Error('INVALID_CONNECTION_REVISION')
      return { id: brandString<RevisionId>(row.id), connection: row.connection, credential: row.credential,
        createdAt: row.createdAt, policyRevision: Number(row.policyRevision),
        transportLease: 'host-network-v1' as const, profile: profileFrom(row.profile) }
    })
    if (new Set(revisions.map(row => row.id)).size !== revisions.length
      || Object.entries(current).some(([id, ref]) => !idPattern.test(id) || !revisions.some(row => row.id === ref && row.connection === id))
      || value.revoked.some(ref => typeof ref !== 'string' || !uuid.test(ref))
      || value.operations.some(ref => typeof ref !== 'string' || !uuid.test(ref))) throw new Error('INVALID_CONNECTION_STATE')
    return { schemaVersion: 1, revision: Number(value.revision), current: current as Record<string, RevisionId>, revisions,
      revoked: value.revoked as string[], operations: value.operations as OperationId[] }
  }

  private async recover(): Promise<void> {
    this.state = this.decode(await this.read('state.json') ?? empty())
    const journal = await this.read('journal.json')
    if (journal !== undefined) {
      const pending = this.decode(journal)
      for (const row of pending.revisions) {
        if (!this.state.revisions.some(saved => saved.id === row.id)) await this.secrets.unset(row.credential)
      }
      await unlink(join(this.directory, 'journal.json'))
    }
  }

  private async apply(): Promise<void> {
    for (const row of this.state.revisions) {
      if (this.state.revoked.includes(row.id)) continue
      const key = await this.secrets.get(row.credential)
      if (!key) throw new Error('CONNECTION_CREDENTIAL_REBIND_REQUIRED')
      this.keys.set(row.id, key)
    }
    this.publish(this.state)
    this.appliedRevision = this.state.revision
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const pending = this.tail.then(() => withFileLock(join(this.directory, 'owner'), work))
    this.tail = pending.then(() => {}, () => {})
    return pending
  }

  /** Commit or revoke one connection. Retrying an operation ID observes its prior commit.
   * @param input - Validated at this wire entry, including operation ID and expected revision.
   * @returns Applied state and the committed operation observation; an error may require reconciliation.
   */
  mutate(input: unknown): Promise<ReturnType<ConnectionStore['status']>> {
    const request = object(input)
    if (typeof request.operationId !== 'string' || !uuid.test(request.operationId)
      || typeof request.connection !== 'string' || !idPattern.test(request.connection)
      || !Number.isSafeInteger(request.expectedRevision)) return Promise.reject(new Error('INVALID_CONNECTION_REQUEST'))
    const operationId = brandString<OperationId>(request.operationId), connection = request.connection
    return this.exclusive(async () => {
      if (this.stopped) throw new Error('CONNECTION_OWNER_STOPPED')
      await this.recover()
      if (this.state.operations.includes(operationId)) { await this.apply(); return this.status(operationId) }
      if (request.expectedRevision !== this.state.revision) throw new Error('CONNECTION_CONFLICT')
      if (this.appliedRevision !== this.state.revision) await this.apply()
      const next = structuredClone(this.state)
      next.revision++
      next.operations = [...next.operations.slice(-255), operationId]
      let row: Revision | undefined
      if (request.action === 'revoke') {
        if (!next.current[connection]) throw new Error('CONNECTION_NOT_FOUND')
        for (const item of next.revisions) if (item.connection === connection && !next.revoked.includes(item.id)) next.revoked.push(item.id)
        const { [connection]: _removed, ...current } = next.current
        next.current = current
      } else if (request.action === 'save') {
        if (typeof request.key !== 'string' || request.key.length === 0 || request.key.length > 16384 || /[\r\n\0]/.test(request.key)) throw new Error('INVALID_CREDENTIAL')
        const id = brandString<RevisionId>(randomUUID())
        row = { id, connection, createdAt: Date.now(), profile: profileFrom(request.profile),
          credential: `NIDOFY_REV_${id.replaceAll('-', '_')}`, policyRevision: next.revision, transportLease: 'host-network-v1' }
        next.revisions.push(row); next.current[connection] = id
      } else throw new Error('INVALID_CONNECTION_ACTION')
      if (Object.keys(next.current).length > 64 || next.revisions.length > 512
        || Buffer.byteLength(JSON.stringify(next)) > 4 * 1024 * 1024) throw new Error('CONNECTION_CAPACITY')
      await writeFileAtomic(join(this.directory, 'journal.json'), JSON.stringify(next), { mode: 0o600 })
      await this.fault('prepared')
      if (row) await this.secrets.set(row.credential, String(request.key))
      await this.fault('credential-staged')
      await writeFileAtomic(join(this.directory, 'state.json'), JSON.stringify(next), { mode: 0o600 })
      await this.fault('committed')
      this.state = next
      await this.apply()
      await unlink(join(this.directory, 'journal.json'))
      await this.fault('applied')
      return this.status(operationId)
    })
  }

  /** Return desired/applied observations and a digest containing no credential values.
   * @param operationId - Optional operation to inspect within the retained idempotency window.
   * @returns Current process observations; use inspect after an uncertain operation result.
   */
  status(operationId?: string) {
    return { hostEpoch: this.hostEpoch, desiredRevision: this.state.revision, appliedRevision: this.appliedRevision,
      operationId, committed: operationId === undefined ? undefined : this.state.operations.some(id => id === operationId),
      routeDigest: digest({ current: this.state.current,
        revisions: this.state.revisions.map(({ credential: _credential, ...row }) => row), revoked: this.state.revoked }),
      connections: Object.entries(this.state.current).map(([connection, id]) => {
        const row = this.state.revisions.find(item => item.id === id)
        return { connection, revision: id, profile: row?.profile, configured: this.keys.has(id) }
      }), retainedRevisions: this.state.revisions.length, activeLeases: [...this.counts.values()].reduce((a, b) => a + b, 0) }
  }

  /** Reconcile disk after a lost ACK or interrupted publish, then report actual application.
   * @param operationId - Optional operation whose durable commit is queried.
   * @returns Reconciled desired/applied state for this Host epoch.
   */
  inspect(operationId?: string): Promise<ReturnType<ConnectionStore['status']>> {
    return this.exclusive(async () => { await this.recover(); await this.apply(); return this.status(operationId) })
  }

  /** Hold one immutable credential and transport policy until release; revocation remains live.
   * @param id - Retained revision selected for this request or retry.
   * @returns Owned lease; callers release it after completion and check before sending.
   */
  acquire(id: RevisionId): { revision: Revision; key: string; check(): void; release(): void } {
    const revision = this.state.revisions.find(row => row.id === id), key = this.keys.get(id)
    if (!revision || !key || this.state.revoked.includes(id) || this.stopped) throw new Error('CONNECTION_REVOKED_OR_RETIRED')
    this.counts.set(id, (this.counts.get(id) ?? 0) + 1)
    let released = false
    return { revision, key, check: () => {
      if (released || this.stopped || this.state.revoked.includes(id)) throw new Error('CONNECTION_LEASE_REVOKED')
    }, release: () => {
      if (released) return
      released = true
      const count = (this.counts.get(id) ?? 1) - 1
      if (count === 0) this.counts.delete(id); else this.counts.set(id, count)
    } }
  }

  /** Retire unreferenced revisions only after the rollback window and all retry/stream leases.
   * @param now - Current retirement clock, injectable for deterministic qualification.
   */
  collect(now = Date.now()): Promise<void> {
    return this.exclusive(async () => {
      const active = new Set(Object.values(this.state.current))
      const retired = this.state.revisions.filter(row => !active.has(row.id)
        && !this.counts.has(row.id) && now - row.createdAt >= this.retentionMs)
      if (retired.length === 0) return
      const next = { ...this.state, revisions: this.state.revisions.filter(row => !retired.includes(row)),
        revoked: this.state.revoked.filter(id => !retired.some(row => row.id === id)) }
      // Journal retains retired refs so an interrupted deletion is repeated at startup.
      await writeFileAtomic(join(this.directory, 'journal.json'), JSON.stringify(this.state), { mode: 0o600 })
      await writeFileAtomic(join(this.directory, 'state.json'), JSON.stringify(next), { mode: 0o600 })
      this.state = next
      this.publish(next)
      for (const row of retired) { await this.secrets.unset(row.credential); this.keys.delete(row.id) }
      await unlink(join(this.directory, 'journal.json'))
    })
  }

  /** Drain writes before dropping process-local credentials. */
  async close(): Promise<void> { this.stopped = true; await this.tail; this.keys.clear() }
}
