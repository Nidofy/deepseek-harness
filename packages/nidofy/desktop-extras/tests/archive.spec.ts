import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { MeasurementStore } from '../src/legacy/diagnostic-store.mjs'

it('archives through the official atomic writer and drains pending writes on disposal', async () => {
  const home = await mkdtemp(join(tmpdir(), 'nidofy-archive-'))
  try {
    const archive = new MeasurementStore(home)
    const saved = archive.save({ schemaVersion: 2, records: [], tools: [] })
    await archive.close()
    const result = await saved as { id: string }
    const restored = await archive.read(result.id)
    expect(restored.records).toEqual([])
    expect(await archive.list()).toHaveLength(1)
  } finally { await rm(home, { recursive: true, force: true }) }
})
