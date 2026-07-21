import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import {
  discoveredWorkspaceForPath,
  findWorkspaceForPath,
  getWorkspace,
  groupDiscoveredWorkspaces,
  liftToWorkspaceRoot,
  listWorkspaces,
  registerWorkspace,
  reorderWorkspaces,
  setRegistryPath
} from './registry'

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
    expect(entry.id).toMatch(/^[0-9a-z]{10}$/) // short base36 id
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

describe('workspace discovery grouping', () => {
  test('groups providers by normalized path in display order', () => {
    const path = '/Users/foo/project'
    const grouped = groupDiscoveredWorkspaces([
      { path, type: 'openclaw' },
      { path: '/Users/foo/project/../project', type: 'codex' },
      { path, type: 'claude-code' },
      { path, type: 'codex' }
    ])

    expect(grouped).toEqual([
      {
        path,
        types: ['claude-code', 'codex', 'openclaw']
      }
    ])
  })

  test('filters registered paths after normalization', () => {
    const grouped = groupDiscoveredWorkspaces(
      [{ path: '/Users/foo/project/../project', type: 'codex' }],
      new Set(['/Users/foo/project'])
    )

    expect(grouped).toEqual([])
  })

  test('returns zero, one, or multiple types for one chosen folder', () => {
    const path = '/Users/foo/project'

    expect(discoveredWorkspaceForPath(path, [])).toEqual({ path, types: [] })
    expect(discoveredWorkspaceForPath(path, [{ path, type: 'codex' }])).toEqual({
      path,
      types: ['codex']
    })
    expect(
      discoveredWorkspaceForPath(path, [
        { path, type: 'openclaw' },
        { path, type: 'claude-code' }
      ])
    ).toEqual({
      path,
      types: ['claude-code', 'openclaw']
    })
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

describe('reorderWorkspaces', () => {
  test('persists workspace order', async () => {
    const a = await registerWorkspace('/Users/foo/project-a')
    const b = await registerWorkspace('/Users/foo/project-b')
    const c = await registerWorkspace('/Users/foo/project-c')

    await reorderWorkspaces([c.id, a.id, b.id])

    const list = await listWorkspaces()
    expect(list.map(e => e.id)).toEqual([c.id, a.id, b.id])
  })

  test('rejects missing ids', async () => {
    const a = await registerWorkspace('/Users/foo/project-a')
    await registerWorkspace('/Users/foo/project-b')

    await expect(reorderWorkspaces([a.id])).rejects.toThrow(
      'Workspace order must include every workspace'
    )
  })

  test('rejects duplicate ids', async () => {
    const a = await registerWorkspace('/Users/foo/project-a')
    await registerWorkspace('/Users/foo/project-b')

    await expect(reorderWorkspaces([a.id, a.id])).rejects.toThrow(
      'Workspace order contains duplicate ids'
    )
  })

  test('rejects unknown ids', async () => {
    const a = await registerWorkspace('/Users/foo/project-a')
    await registerWorkspace('/Users/foo/project-b')

    await expect(reorderWorkspaces([a.id, 'missing'])).rejects.toThrow(
      'Workspace order contains unknown ids'
    )
  })

  test('preserves workspace metadata', async () => {
    const a = await registerWorkspace('/Users/foo/project-a', {
      type: 'openclaw',
      name: 'Agent A',
      agentId: 'agent-a',
      isDefault: true,
      lastRunAt: '2026-07-08T10:00:00.000Z'
    })
    const b = await registerWorkspace('/Users/foo/project-b', { type: 'claude-code' })

    await reorderWorkspaces([b.id, a.id])

    const list = await listWorkspaces()
    expect(list[1]).toMatchObject({
      id: a.id,
      path: '/Users/foo/project-a',
      type: 'openclaw',
      name: 'Agent A',
      agentId: 'agent-a',
      isDefault: true,
      lastRunAt: '2026-07-08T10:00:00.000Z'
    })
  })
})

describe('findWorkspaceForPath', () => {
  const ws = (path: string) => ({ path })

  test('matches the workspace root exactly', () => {
    const list = [ws('/Users/foo/proj')]
    expect(findWorkspaceForPath(list, '/Users/foo/proj')).toEqual(ws('/Users/foo/proj'))
  })

  test('matches from a subdirectory (e.g. inside .moi/)', () => {
    // The core bug: `moi bundle` run from inside `.moi/` must still resolve to
    // the workspace root, not treat `.moi/` as its own workspace.
    const list = [ws('/Users/foo/proj')]
    expect(findWorkspaceForPath(list, '/Users/foo/proj/.moi')).toEqual(ws('/Users/foo/proj'))
    expect(findWorkspaceForPath(list, '/Users/foo/proj/.moi/views')).toEqual(ws('/Users/foo/proj'))
  })

  test('returns null when the path is not inside any workspace', () => {
    const list = [ws('/Users/foo/proj')]
    expect(findWorkspaceForPath(list, '/Users/bar/other')).toBeNull()
    // A sibling sharing a name prefix but not a path boundary must not match.
    expect(findWorkspaceForPath(list, '/Users/foo/proj-2')).toBeNull()
  })

  test('picks the nearest ancestor when workspaces are nested', () => {
    const list = [ws('/Users/foo/proj'), ws('/Users/foo/proj/nested')]
    expect(findWorkspaceForPath(list, '/Users/foo/proj/nested/.moi')).toEqual(
      ws('/Users/foo/proj/nested')
    )
    expect(findWorkspaceForPath(list, '/Users/foo/proj/other')).toEqual(ws('/Users/foo/proj'))
  })

  test('normalizes the requested path before matching', () => {
    const list = [ws('/Users/foo/proj')]
    expect(findWorkspaceForPath(list, '/Users/foo/proj/.moi/..')).toEqual(ws('/Users/foo/proj'))
  })

  test('returns null for an empty registry', () => {
    expect(findWorkspaceForPath([], '/anywhere')).toBeNull()
  })
})

describe('liftToWorkspaceRoot', () => {
  test('lifts a path inside .moi to the workspace root', () => {
    expect(liftToWorkspaceRoot('/Users/foo/proj/.moi')).toBe('/Users/foo/proj')
    expect(liftToWorkspaceRoot('/Users/foo/proj/.moi/widgets')).toBe('/Users/foo/proj')
    expect(liftToWorkspaceRoot('/Users/foo/proj/.moi/.build/views')).toBe('/Users/foo/proj')
  })

  test('lifts an accidentally-nested .moi/.moi all the way back', () => {
    // Cuts at the FIRST `.moi` segment, so any nesting depth resolves to the
    // true root — this is what prevents `moi init` inside `.moi` from deepening
    // the nest.
    expect(liftToWorkspaceRoot('/Users/foo/proj/.moi/.moi')).toBe('/Users/foo/proj')
    expect(liftToWorkspaceRoot('/Users/foo/proj/.moi/.moi/.build')).toBe('/Users/foo/proj')
  })

  test('leaves a normal path unchanged', () => {
    expect(liftToWorkspaceRoot('/Users/foo/proj')).toBe('/Users/foo/proj')
    expect(liftToWorkspaceRoot('/Users/foo/proj/sub/deep')).toBe('/Users/foo/proj/sub/deep')
  })

  test('does not match a directory that merely starts with .moi', () => {
    expect(liftToWorkspaceRoot('/Users/foo/.moimoi/x')).toBe('/Users/foo/.moimoi/x')
  })

  test('normalizes the path', () => {
    expect(liftToWorkspaceRoot('/Users/foo/proj/.moi/..')).toBe('/Users/foo/proj')
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
