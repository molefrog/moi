import { afterEach, beforeEach, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { writeStateFile } from './file'
import {
  DEFAULT_WORKSPACE_STATE_ROOT,
  findStateIdForPath,
  LockTimeoutError,
  prepareWorkspaceStates,
  readWorkspaceState,
  setWorkspaceStateRoot,
  updateWorkspaceState,
  WorkspaceStateVersionError
} from './index'

let root: string
const ws = { id: 'ws-1', path: '/projects/notes' }
const statePath = () => join(root, ws.id, 'state.json')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'moi-workspace-state-'))
  setWorkspaceStateRoot(root)
})

afterEach(async () => {
  setWorkspaceStateRoot(DEFAULT_WORKSPACE_STATE_ROOT)
  await rm(root, { recursive: true, force: true })
})

test('a missing file reads as empty state for the workspace', async () => {
  expect(await readWorkspaceState(ws)).toEqual({
    version: 1,
    workspacePath: '/projects/notes',
    selected: {},
    sessions: {},
    pendingViews: {}
  })
  expect(existsSync(statePath())).toBe(false)
})

test('an update saves the whole state in one file and returns the change result', async () => {
  const result = await updateWorkspaceState(ws, state => {
    state.pinnedSessionId = 's1'
    state.selected.overview = 's1'
    state.sessions.s1 = { config: { model: 'sonnet' } }
    return 'saved'
  })
  expect(result).toBe('saved')
  expect(await Bun.file(statePath()).json()).toEqual({
    version: 1,
    workspacePath: '/projects/notes',
    pinnedSessionId: 's1',
    selected: { overview: 's1' },
    sessions: { s1: { config: { model: 'sonnet' } } },
    pendingViews: {}
  })
})

test('reads are copies', async () => {
  await updateWorkspaceState(ws, state => {
    state.selected.overview = 's1'
  })
  const copy = await readWorkspaceState(ws)
  copy.selected.overview = 'changed'
  expect((await readWorkspaceState(ws)).selected.overview).toBe('s1')
})

test('concurrent updates to one workspace all land', async () => {
  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      updateWorkspaceState(ws, state => {
        state.sessions[`s${index}`] = { tabId: 'scratchpad' }
      })
    )
  )
  expect(Object.keys((await Bun.file(statePath()).json()).sessions)).toHaveLength(20)
})

test('a change that throws leaves the state untouched', async () => {
  await updateWorkspaceState(ws, state => {
    state.selected.overview = 's1'
  })
  await expect(
    updateWorkspaceState(ws, state => {
      state.selected.overview = 's2'
      throw new Error('invalid')
    })
  ).rejects.toThrow('invalid')
  expect((await readWorkspaceState(ws)).selected.overview).toBe('s1')
  expect((await Bun.file(statePath()).json()).selected.overview).toBe('s1')
})

test('a change that keeps the state as it was skips the write', async () => {
  await updateWorkspaceState(ws, () => 'nothing')
  expect(existsSync(statePath())).toBe(false)
})

test('an async change is refused', async () => {
  await expect(updateWorkspaceState(ws, async () => {})).rejects.toThrow('synchronous')
  expect(existsSync(statePath())).toBe(false)
})

test('empty session entries and settings are left out of the file', async () => {
  await updateWorkspaceState(ws, state => {
    state.sessions.s1 = { config: {}, tabId: undefined }
  })
  expect(existsSync(statePath())).toBe(false)
})

test('a write whose lock expired never replaces the file', async () => {
  await updateWorkspaceState(ws, state => {
    state.selected.overview = 'current'
  })
  const stale = { isCurrent: () => false }
  const state = await readWorkspaceState(ws)
  state.selected.overview = 'stale'
  await expect(writeStateFile(statePath(), state, stale)).rejects.toBeInstanceOf(LockTimeoutError)
  expect((await Bun.file(statePath()).json()).selected.overview).toBe('current')
  expect(await readdir(join(root, ws.id))).toEqual(['state.json'])
})

test('a damaged file is moved aside and the workspace starts empty', async () => {
  await mkdir(join(root, ws.id), { recursive: true })
  await Bun.write(statePath(), '{"version": 1, "selected": ')
  expect((await readWorkspaceState(ws)).selected).toEqual({})
  const files = await readdir(join(root, ws.id))
  expect(files.some(file => file.startsWith('state.json.corrupt-'))).toBe(true)
})

test('a file from a newer Moi is readable but never overwritten', async () => {
  await mkdir(join(root, ws.id), { recursive: true })
  const newer = JSON.stringify({
    version: 2,
    workspacePath: ws.path,
    selected: { overview: 's1' },
    sessions: {},
    pendingViews: {},
    somethingNew: true
  })
  await Bun.write(statePath(), newer)
  expect((await readWorkspaceState(ws)).selected.overview).toBe('s1')
  await expect(
    updateWorkspaceState(ws, state => {
      state.selected.overview = 's2'
    })
  ).rejects.toBeInstanceOf(WorkspaceStateVersionError)
  expect(await Bun.file(statePath()).text()).toBe(newer)
})

test('finds the id a folder had before it was removed', async () => {
  await updateWorkspaceState(ws, state => {
    state.pinnedSessionId = 's1'
  })
  expect(await findStateIdForPath('/projects/notes')).toBe('ws-1')
  expect(await findStateIdForPath('/projects/other')).toBeUndefined()
})

test('startup drops state for removed workspaces whose folder is gone, and leftover temp files', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'moi-workspace-folder-'))
  const registered = { id: 'registered', path: '/gone/but-registered' }
  const removedKept = { id: 'removed-kept', path: folder }
  const removedGone = { id: 'removed-gone', path: '/gone/for-good' }
  for (const entry of [registered, removedKept, removedGone])
    await updateWorkspaceState(entry, state => {
      state.selected.overview = 's1'
    })
  await Bun.write(join(root, 'registered', 'state.json.123.1.tmp'), '{')

  await prepareWorkspaceStates([registered])

  expect((await readdir(root)).sort()).toEqual(['registered', 'removed-kept'])
  expect(await readdir(join(root, 'registered'))).toEqual(['state.json'])
  await rm(folder, { recursive: true, force: true })
})
