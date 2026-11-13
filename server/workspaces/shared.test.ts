import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as remote from '../remote/client'
import * as config from '../app-config'
import { openSharedWorkspace } from './shared'
import {
  DEFAULT_REGISTRY_PATH,
  listWorkspaces,
  registerWorkspace,
  setRegistryPath
} from './registry'
import { initializeRemoteWorkspaceConfig } from './layout'
let root: string
const target = { user_id: 'alice', workspace_id: 'board' }
const spies: { mockRestore(): void }[] = []
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'moi-shared-'))
  setRegistryPath(join(root, 'registry.json'))
  spies.push(spyOn(config, 'createdWorkspacesRoot').mockReturnValue(join(root, 'spaces')))
  spies.push(
    spyOn(remote, 'fetchSharedWorkspaces').mockResolvedValue(
      ['alice', 'bob'].map(id => ({
        id: 'board',
        owner: { id, name: id, email: `${id}@example.com` }
      }))
    )
  )
})
afterEach(async () => {
  for (const spy of spies.splice(0)) spy.mockRestore()
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(root, { recursive: true, force: true })
})
test('concurrent opens provision once and preserve personal config and skill edits', async () => {
  const [first, second] = await Promise.all([
    openSharedWorkspace(target),
    openSharedWorkspace(target)
  ])
  expect(first.id).toBe(second.id)
  const file = Bun.file(join(first.path, '.moi/.workspace.json'))
  expect(await file.json()).toEqual({ version: 2, remote: target })
  expect(await Bun.file(join(first.path, '.moi/package.json')).exists()).toBe(false)
  const skill = join(first.path, '.agents/skills/moi-workspace/SKILL.md')
  expect(await Bun.file(skill).exists()).toBe(true)
  await Bun.write(skill, 'Personal skill version')
  await Bun.write(file, JSON.stringify({ version: 2, remote: target, layoutMode: 'fullscreen' }))
  await openSharedWorkspace(target)
  expect((await file.json()).layoutMode).toBe('fullscreen')
  expect(await Bun.file(skill).text()).toBe('Personal skill version')
  const other = await openSharedWorkspace({ ...target, user_id: 'bob' })
  expect(other.path).not.toBe(first.path)
  expect(await listWorkspaces()).toHaveLength(2)
})
test('manual references are reused and malformed addresses create nothing', async () => {
  const path = join(root, 'manual')
  await initializeRemoteWorkspaceConfig(path, target)
  const entry = await registerWorkspace(path)
  expect((await openSharedWorkspace(target)).id).toBe(entry.id)
  await expect(openSharedWorkspace({ ...target, user_id: '../unknown' })).rejects.toThrow(
    'Invalid shared workspace address'
  )
  expect(await listWorkspaces()).toHaveLength(1)
})
test('a matching reference left before registration is reused on retry', async () => {
  const hash = new Bun.CryptoHasher('sha256')
    .update(JSON.stringify(['alice', 'board']))
    .digest('hex')
    .slice(0, 12)
  const path = join(root, 'spaces', `shared-board-${hash}`)
  await mkdir(path, { recursive: true })
  await expect(openSharedWorkspace(target)).rejects.toThrow('different content')
  await initializeRemoteWorkspaceConfig(path, target)
  expect((await openSharedWorkspace(target)).path).toBe(path)
})

test('provisioning needs no machine Cloud credentials', async () => {
  const spy = spyOn(remote, 'fetchSharedWorkspaces').mockRejectedValue(
    new Error('No machine login')
  )
  try {
    await openSharedWorkspace(target)
    expect(spy).not.toHaveBeenCalled()
    expect(await listWorkspaces()).toHaveLength(1)
  } finally {
    spy.mockRestore()
  }
})
