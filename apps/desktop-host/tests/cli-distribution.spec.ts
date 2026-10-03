import { expect, it, onTestFinished } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareCliDistribution } from '../src/cli-distribution.ts'

it('directs the bundled CLI to the same isolated home as the personal shell', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nidofy-cli-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'dsh'))
  await writeFile(join(root, 'package.json'), JSON.stringify({ dshDistribution: { kind: 'personal' } }))
  const env = { APPDATA: root, DSH_HOME: join(root, 'official') }
  await prepareCliDistribution(join(root, 'dsh'), env)
  expect(env.DSH_HOME).toBe(join(root, 'Nidofy DSH Desktop', 'harness'))
  await expect(prepareCliDistribution(join(root, 'dsh'), { NIDOFY_DESKTOP_DATA_ROOT: 'relative' })).rejects.toThrow('INVALID')
})
