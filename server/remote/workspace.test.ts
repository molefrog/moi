import { test, expect, spyOn } from 'bun:test'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as client from './client'
import { initializeRemoteWorkspace, currentRemoteWorkspace } from './workspace'
import { setRegistryPath, DEFAULT_REGISTRY_PATH, listWorkspaces } from '../workspaces/registry'

test('remote initialization is repeatable and preserves workspace files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'moi-link-')),
    folder = join(root, 'workspace')
  const shares = spyOn(client, 'fetchSharedWorkspaces').mockResolvedValue([
    { id: 'board', owner: { id: 'owner', name: 'Owner', email: 'owner@example.com' } }
  ])
  setRegistryPath(join(root, 'registry.json'))
  try {
    await mkdir(folder)
    await Bun.write(join(folder, 'notes.txt'), 'keep me')
    const result = await initializeRemoteWorkspace(folder, {
      user_id: 'owner',
      workspace_id: 'board'
    })
    expect(result.path).toBe(folder)
    expect(await currentRemoteWorkspace(folder)).toEqual({
      path: folder,
      user_id: 'owner',
      workspace_id: 'board'
    })
    expect(await Bun.file(join(folder, '.agents/skills/moi-workspace/SKILL.md')).exists()).toBe(
      true
    )
    expect(await Bun.file(join(folder, '.moi/.workspace.json')).json()).toEqual({
      version: 2,
      remote: { user_id: 'owner', workspace_id: 'board' }
    })
    expect(await Bun.file(join(folder, 'notes.txt')).text()).toBe('keep me')
    await initializeRemoteWorkspace(folder, { user_id: 'owner', workspace_id: 'board' })
    expect((await listWorkspaces()).map(workspace => workspace.path)).toEqual([folder])
    await expect(
      initializeRemoteWorkspace(join(root, 'other'), { user_id: 'stranger', workspace_id: 'board' })
    ).rejects.toThrow('not shared')
  } finally {
    shares.mockRestore()
    setRegistryPath(DEFAULT_REGISTRY_PATH)
    await rm(root, { recursive: true, force: true })
  }
})

test('remote initialization targets the requested folder even inside a registered parent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'moi-link-parent-'))
  const folder = join(root, 'nested')
  const shares = spyOn(client, 'fetchSharedWorkspaces').mockResolvedValue([
    { id: 'parent', owner: { id: 'owner', name: 'Owner', email: 'owner@example.com' } },
    { id: 'child', owner: { id: 'owner', name: 'Owner', email: 'owner@example.com' } }
  ])
  setRegistryPath(join(root, 'registry.json'))
  try {
    await mkdir(folder)
    await initializeRemoteWorkspace(root, { user_id: 'owner', workspace_id: 'parent' })
    const before = await Bun.file(join(root, '.moi/.workspace.json')).text()
    const linked = await initializeRemoteWorkspace(folder, {
      user_id: 'owner',
      workspace_id: 'child'
    })
    expect(linked.path).toBe(folder)
    expect(await currentRemoteWorkspace(folder)).toEqual({
      path: folder,
      user_id: 'owner',
      workspace_id: 'child'
    })
    expect(await Bun.file(join(root, '.moi/.workspace.json')).text()).toBe(before)
    await expect(
      initializeRemoteWorkspace(join(root, 'another'), {
        user_id: 'owner',
        workspace_id: 'child'
      })
    ).rejects.toThrow('already initialized')
    expect(await Bun.file(join(root, 'another/.moi/.workspace.json')).exists()).toBe(false)
  } finally {
    shares.mockRestore()
    setRegistryPath(DEFAULT_REGISTRY_PATH)
    await rm(root, { recursive: true, force: true })
  }
})
