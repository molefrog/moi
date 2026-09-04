import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import {
  assertWorkspaceIdAvailable,
  findWorkspaceForPath,
  getWorkspace,
  groupDiscoveredWorkspaces,
  liftToWorkspaceRoot,
  listWorkspaces,
  registerWorkspace,
  removeWorkspace,
  reorderWorkspaces,
  setRegistryPath
} from './registry'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'moi-registry-test-'))
  setRegistryPath(join(tmpDir, 'data', 'workspaces.json'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('registerWorkspace', () => {
  test('preserves concurrent registrations', async () => {
    const entries = await Promise.all(
      Array.from({ length: 20 }, (_, i) => registerWorkspace(join(tmpDir, `project-${i}`)))
    )
    expect((await listWorkspaces()).map(entry => entry.id).sort()).toEqual(
      entries.map(entry => entry.id).sort()
    )
  })

  test('concurrent registrations of one path share the same id', async () => {
    const entries = await Promise.all([
      registerWorkspace(join(tmpDir, 'project')),
      registerWorkspace(join(tmpDir, 'project'))
    ])
    expect(entries[0].id).toBe(entries[1].id)
    expect(await listWorkspaces()).toHaveLength(1)
  })

  test('validates chosen ids inside the lock and recovers after rejection', async () => {
    const results = await Promise.allSettled([
      registerWorkspace(join(tmpDir, 'a'), { id: 'shared' }),
      registerWorkspace(join(tmpDir, 'b'), { id: 'shared' }),
      registerWorkspace(join(tmpDir, 'c'), { id: 'other' })
    ])
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
    expect((await listWorkspaces()).map(entry => entry.id)).toEqual(['other', 'shared'])
  })

  test('serializes removal and reordering with registration', async () => {
    const a = await registerWorkspace(join(tmpDir, 'a'))
    const b = await registerWorkspace(join(tmpDir, 'b'))
    const [, , c] = await Promise.all([
      reorderWorkspaces([a.id, b.id]),
      removeWorkspace(a.id),
      registerWorkspace(join(tmpDir, 'c'))
    ])
    expect((await listWorkspaces()).map(entry => entry.id)).toEqual([c.id, b.id])
  })

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

  test('prepends new workspaces without moving existing registrations', async () => {
    const first = await registerWorkspace('/Users/foo/first')
    const second = await registerWorkspace('/Users/foo/second')

    await registerWorkspace('/Users/foo/first')

    expect((await listWorkspaces()).map(entry => entry.id)).toEqual([second.id, first.id])
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

describe('registerWorkspace with a chosen id', () => {
  test('registers under the given id', async () => {
    const entry = await registerWorkspace('/Users/foo/project', { id: 'my-workspace' })
    expect(entry.id).toBe('my-workspace')
    expect((await getWorkspace('my-workspace'))!.path).toBe('/Users/foo/project')
  })

  test('rejects an id the workspace cannot take because it already has one', async () => {
    const existing = await registerWorkspace('/Users/foo/project')

    await expect(registerWorkspace('/Users/foo/project', { id: 'my-workspace' })).rejects.toThrow(
      `/Users/foo/project is already registered with id ${existing.id}`
    )
    expect((await listWorkspaces()).map(e => e.id)).toEqual([existing.id])
  })

  test('re-registering with the same id is a no-op', async () => {
    const first = await registerWorkspace('/Users/foo/project', { id: 'my-workspace' })
    const again = await registerWorkspace('/Users/foo/project', { id: 'my-workspace' })
    expect(again.id).toBe(first.id)
    expect(await listWorkspaces()).toHaveLength(1)
  })

  test('rejects an id already taken by another workspace', async () => {
    await registerWorkspace('/Users/foo/project-a', { id: 'shared' })

    await expect(registerWorkspace('/Users/foo/project-b', { id: 'shared' })).rejects.toThrow(
      'Workspace id shared is already taken'
    )
    expect(await listWorkspaces()).toHaveLength(1)
  })

  test('rejects a malformed id', async () => {
    await expect(registerWorkspace('/Users/foo/project', { id: '-dashed' })).rejects.toThrow(
      'Use letters, numbers, dashes and underscores'
    )
    await expect(registerWorkspace('/Users/foo/project', { id: 'has space' })).rejects.toThrow(
      'Use letters, numbers, dashes and underscores'
    )
    expect(await listWorkspaces()).toEqual([])
  })

  test('rejects an id that a collection route would shadow', async () => {
    await expect(registerWorkspace('/Users/foo/project', { id: 'create' })).rejects.toThrow(
      'Workspace id create is reserved'
    )
    // Case-insensitive, so the rule cannot be sidestepped by spelling.
    await expect(registerWorkspace('/Users/foo/project', { id: 'WS' })).rejects.toThrow(
      'is reserved'
    )
    expect(await listWorkspaces()).toEqual([])
  })

  test('assertWorkspaceIdAvailable mirrors the registration checks', async () => {
    await expect(assertWorkspaceIdAvailable('/Users/foo/project', 'free')).resolves.toBeUndefined()

    const existing = await registerWorkspace('/Users/foo/project')
    await expect(assertWorkspaceIdAvailable('/Users/foo/project', 'free')).rejects.toThrow(
      `already registered with id ${existing.id}`
    )
    // Relative paths resolve the same way registration does.
    await expect(assertWorkspaceIdAvailable('.', existing.id)).rejects.toThrow(
      `Workspace id ${existing.id} is already taken`
    )
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

  test('keeps manual order below a newly registered workspace', async () => {
    const a = await registerWorkspace('/Users/foo/project-a')
    const b = await registerWorkspace('/Users/foo/project-b')
    await reorderWorkspaces([a.id, b.id])

    const c = await registerWorkspace('/Users/foo/project-c')

    expect((await listWorkspaces()).map(entry => entry.id)).toEqual([c.id, a.id, b.id])
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
