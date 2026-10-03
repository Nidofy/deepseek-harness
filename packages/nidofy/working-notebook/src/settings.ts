/** Serialized enhancement preferences are independent of note revisions and Session data. */
import { mkdir, readFile, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

export interface NotebookSettings { schemaVersion: 1; revision: number; autoOrganize: boolean }
/** Owns one durable profile-wide switch with compare-and-swap writes. */
export class NotebookSettingsStore {
  value: NotebookSettings
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly home: string, initial: boolean) { this.value = { schemaVersion: 1, revision: 0, autoOrganize: initial } }
  async open(): Promise<void> {
    const path = join(this.home, 'settings.json')
    let stat
    try { stat = await lstat(path) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw Error('NOTEBOOK_SETTINGS_UNREADABLE')
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    this.value = validate(value)
  }
  save(input: unknown): Promise<NotebookSettings> {
    const next = validate(input)
    const task = this.queue.catch(() => {}).then(async () => {
      if (next.revision !== this.value.revision) throw Error('NOTEBOOK_SETTINGS_CONFLICT')
      const committed: NotebookSettings = { ...next, revision: next.revision + 1 }
      await mkdir(this.home, { recursive: true, mode: 0o700 })
      await writeFileAtomic(join(this.home, 'settings.json'), JSON.stringify(committed) + '\n', { mode: 0o600 })
      this.value = committed
      return { ...committed }
    })
    this.queue = task
    return task
  }
  async close(): Promise<void> { await this.queue.catch(() => {}) }
}
function validate(value: unknown): NotebookSettings {
  if (!value || typeof value !== 'object' || !('schemaVersion' in value) || value.schemaVersion !== 1
    || !('revision' in value) || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0
    || !('autoOrganize' in value) || typeof value.autoOrganize !== 'boolean') throw Error('NOTEBOOK_SETTINGS_INVALID')
  return { schemaVersion: 1, revision: value.revision, autoOrganize: value.autoOrganize }
}
