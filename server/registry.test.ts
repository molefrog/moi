import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import { getWorkspace, listWorkspaces, registerWorkspace, setRegistryPath } from './registry'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'moi-registry-test-'))
  setRegistryPath(join(tmpDir, 'workspaces.json'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('registerWorkspace', () => {
  test('registers a new workspace and returns an entry', async () => {
    const entry = await registerWorkspace('/Users/foo/my-project')
    expect(entry.path).toBe('/Users/foo/my-project')
    expect(typeof entry.id).toBe('string')
    expect(entry.id).toHaveLength(36) // UUID v4
    expect(typeof entry.addedAt).toBe('string')
  })

  test('returns existing entry when same path registered twice', async () => {
    const a = await registerWorkspace('/Users/foo/project')
    const b = await registerWorkspace('/Users/foo/project')
    expect(a.id).toBe(b.id)
    expect(a.addedAt).toBe(b.addedAt)
  })

  test('resolves relative paths to absolute', async () => {
    const entry = await registerWorkspace('.')
    expect(entry.path).toBe(process.cwd())
  })

  test('each unique path gets a unique id', async () => {
    const a = await registerWorkspace('/Users/foo/project-a')
    const b = await registerWorkspace('/Users/foo/project-b')
    expect(a.id).not.toBe(b.id)
  })
})

describe('listWorkspaces', () => {
  test('returns empty array when no workspaces registered', async () => {
    const list = await listWorkspaces()
    expect(list).toEqual([])
  })

  test('returns all registered workspaces', async () => {
    await registerWorkspace('/Users/foo/project-a')
    await registerWorkspace('/Users/foo/project-b')
    const list = await listWorkspaces()
    expect(list).toHaveLength(2)
    expect(list.map(e => e.path)).toContain('/Users/foo/project-a')
    expect(list.map(e => e.path)).toContain('/Users/foo/project-b')
  })
})

describe('getWorkspace', () => {
  test('returns entry by id', async () => {
    const entry = await registerWorkspace('/Users/foo/my-project')
    const found = await getWorkspace(entry.id)
    expect(found).not.toBeNull()
    expect(found!.path).toBe('/Users/foo/my-project')
  })

  test('returns null for unknown id', async () => {
    const found = await getWorkspace('00000000-0000-0000-0000-000000000000')
    expect(found).toBeNull()
  })
})
