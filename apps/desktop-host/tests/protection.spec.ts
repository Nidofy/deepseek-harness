import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, link } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { ProtectionOwner, nativeProtection } from '../src/connections/protection.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
it('blocks dispatch, subtask overlap and scope edits until the protected turn is sealed', async () => {
  const commands: object[] = []
  const owner = new ProtectionOwner(async (command) => {
    commands.push(command)
    if ('action' in command && command.action === 'resolve') return { status:'ARMED',workspace:'C:/work' }
    return 'request' in command ? { items: [{ workspace:'C:/work' }] } : { status: 'CONFIRMED', id: 'capture' }
  })
  await expect(owner.check('parent')).rejects.toThrow('ADMISSION_REQUIRED')
  await owner.begin('parent', 1, 'C:/work')
  await owner.check('parent')
  await expect(owner.begin('child', 1, 'C:/work')).rejects.toThrow('BUSY')
  await expect(owner.configure({ action: 'disarm' })).rejects.toThrow('BUSY')
  await owner.end('parent')
  await owner.begin('child', 1, 'C:/work')
  expect(commands.some(command => 'action' in command && command.action === 'check')).toBe(true)
})
it('does not admit any tool after an unknown native capture result', async () => {
  const owner = new ProtectionOwner(async (command) => {
    if ('request' in command) return { items: [{ workspace:'C:/work' }] }
    if ('action' in command && command.action === 'resolve') return { status:'ARMED',workspace:'C:/work' }
    throw new Error('PROTECTION_UNAVAILABLE')
  })
  await expect(owner.begin('task', 1, 'C:/work')).rejects.toThrow('UNAVAILABLE')
  await expect(owner.check('task')).rejects.toThrow('RESTART_REQUIRED')
  await expect(owner.begin('task', 2, 'C:/work')).rejects.toThrow('RESTART_REQUIRED')
})
it.runIf(process.platform === 'win32')('captures and seals with native file identity checks and refuses hardlinks and VCS paths', async () => {
  const parent = resolve('apps/desktop/.desktop-build/qualification')
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(join(parent, 'nidofy-protect-')); roots.push(root)
  const home = join(root, 'home'), workspace = join(root, 'workspace')
  await mkdir(home); await mkdir(workspace); await writeFile(join(workspace, 'a.txt'), 'before')
  const executable = resolve('native/nidofy-protection/target/release/nidofy-protection.exe')
  const owner = new ProtectionOwner(command => nativeProtection(executable, home, command))
  const scopes = await owner.configure({ action: 'scopes' })
  await owner.configure({ action: 'arm', workspace, paths: ['a.txt'], revision: scopes.revision })
  await owner.begin('parent', 1, workspace)
  await owner.check('parent')
  await writeFile(join(workspace, 'a.txt'), 'after')
  await owner.end('parent')
  const records = await owner.configure({ action: 'list' })
  expect(records.items).toHaveLength(1)
  const items = records.items as { id:string }[]
  const preview = await owner.configure({ action:'preview',id:items[0]!.id })
  await expect(owner.configure({ action:'restore',id:items[0]!.id,paths:['a.txt'],expectedRevision:'stale' })).rejects.toThrow('CONFLICT')
  await owner.configure({ action:'restore',id:items[0]!.id,paths:['a.txt'],expectedRevision:preview.revision })
  expect(await readFile(join(workspace,'a.txt'),'utf8')).toBe('before')
  const current = await owner.configure({ action: 'scopes' })
  await link(join(workspace, 'a.txt'), join(workspace, 'alias.txt'))
  await expect(owner.configure({ action: 'arm', workspace, paths: ['alias.txt'], revision: current.revision })).rejects.toThrow('UNAVAILABLE')
  await expect(owner.configure({ action: 'arm', workspace, paths: ['.git/config'], revision: current.revision })).rejects.toThrow('UNAVAILABLE')
})

it('shares a protected capture only with runtime-owned descendants and seals after the last child', async () => {
  const commands: Record<string,unknown>[] = []
  const owner = new ProtectionOwner(async (command) => {
    const value = command as Record<string,unknown>; commands.push(value)
    if(value.action === 'resolve')return { status:'ARMED',workspace:value.workspace }
    return 'request' in command ? { items:[{ workspace:'C:/work' },{ workspace:'C:/other' }] } : { status:'CONFIRMED',id:'capture-'+String(commands.length) }
  })
  await owner.begin('parent',1,'C:/work')
  await owner.begin('child',1,'C:/work','parent')
  await owner.begin('parallel',1,'C:/other')
  await expect(owner.begin('stranger',1,'C:/work')).rejects.toThrow('BUSY')
  await owner.end('parent')
  expect(commands.filter(row=>row.action==='end')).toHaveLength(0)
  await owner.check('child')
  await owner.end('child')
  expect(commands.filter(row=>row.action==='end')).toHaveLength(1)
  await owner.end('parallel')
  expect(commands.filter(row=>row.action==='end')).toHaveLength(2)
})

it.runIf(process.platform === 'win32')('keeps real native captures alive for children and restores disjoint engineering workspaces', async () => {
  const parent = resolve('apps/desktop/.desktop-build/qualification')
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(join(parent, 'nidofy-m3-groups-')); roots.push(root)
  const home = join(root, 'home'), first = join(root, 'first'), second = join(root, 'second')
  await Promise.all([home, first, second].map(path => mkdir(path)))
  await Promise.all([first, second].map(path => writeFile(join(path, 'a.txt'), 'before')))
  const owner = new ProtectionOwner(command => nativeProtection(resolve('native/nidofy-protection/target/release/nidofy-protection.exe'), home, command))
  for (const workspace of [first, second]) {
    const scopes = await owner.configure({ action: 'scopes' })
    await owner.configure({ action: 'arm', workspace, paths: ['a.txt'], revision: scopes.revision })
  }
  await owner.begin('parent', 1, first)
  await owner.begin('child', 1, first, 'parent')
  await owner.begin('engineering', 1, second)
  await expect(owner.begin('unrelated', 1, first)).rejects.toThrow('BUSY')
  await Promise.all([first, second].map(path => writeFile(join(path, 'a.txt'), 'after')))
  await owner.end('parent')
  await owner.check('child')
  await expect(owner.configure({ action: 'restore', id: 'not-used' })).rejects.toThrow('BUSY')
  await owner.end('child'); await owner.end('engineering')
  const records = await owner.configure({ action: 'list' })
  const items = records.items as { id: string }[]
  expect(items).toHaveLength(2)
  for (const item of items) {
    const preview = await owner.configure({ action: 'preview', id: item.id })
    expect(preview.rows).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'a.txt', status: 'READY' })]))
    await owner.configure({ action: 'restore', id: item.id, paths: ['a.txt'], expectedRevision: preview.revision })
  }
  expect(await readFile(join(first, 'a.txt'), 'utf8')).toBe('before')
  expect(await readFile(join(second, 'a.txt'), 'utf8')).toBe('before')
})
