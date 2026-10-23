import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_WORKSPACE_STATE_ROOT,
  setWorkspaceStateRoot,
  updateWorkspaceState
} from '../workspace-state'
import { getSessionConfig, saveSessionConfig } from './config'
import {
  getSessionRecord,
  patchSessionRecord,
  renameSessionEntry,
  withSessionRecords
} from './store'

const ws = { id: 'ws-1', path: '/ws' }
let directory: string
let path: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'moi-session-store-'))
  path = join(directory, ws.id, 'state.json')
  setWorkspaceStateRoot(directory)
})
afterEach(async () => {
  setWorkspaceStateRoot(DEFAULT_WORKSPACE_STATE_ROOT)
  await rm(directory, { recursive: true, force: true })
})

const rename = (from: string, to: string) =>
  updateWorkspaceState(ws, state => renameSessionEntry(state, from, to))

test('concurrent config and metadata updates share a record without leaking config into metadata', async () => {
  await Promise.all([
    saveSessionConfig(ws, 's1', { model: 'sonnet', fastMode: false }),
    patchSessionRecord(ws, 's1', { tabId: 'scratchpad' })
  ])
  expect((await Bun.file(path).json()).sessions).toEqual({
    s1: { config: { model: 'sonnet', fastMode: false }, tabId: 'scratchpad' }
  })
  expect(await getSessionRecord(ws, 's1')).toEqual({
    config: { model: 'sonnet', fastMode: false },
    tabId: 'scratchpad'
  })
  expect(await withSessionRecords(ws, [{ sessionId: 's1', summary: '', lastModified: 0 }])).toEqual(
    [{ sessionId: 's1', summary: '', lastModified: 0, tabId: 'scratchpad' }]
  )
  await saveSessionConfig(ws, 's1', { model: null, fastMode: null })
  expect(await getSessionConfig(ws, 's1')).toEqual({})
  expect(await getSessionRecord(ws, 's1')).toEqual({ tabId: 'scratchpad' })
})

test('renaming a session moves the whole record and preserves destination config overrides', async () => {
  await saveSessionConfig(ws, 'temporary', { model: 'sonnet', effort: 'high' })
  await patchSessionRecord(ws, 'temporary', { tabId: 'scratchpad' })
  await saveSessionConfig(ws, 'native', { model: 'opus' })
  await rename('temporary', 'native')
  expect(await getSessionConfig(ws, 'native')).toEqual({ model: 'opus', effort: 'high' })
  expect(await getSessionRecord(ws, 'native')).toEqual({
    config: { model: 'opus', effort: 'high' },
    tabId: 'scratchpad'
  })
  expect((await Bun.file(path).json()).sessions.temporary).toBeUndefined()
})

test('session renames move metadata and fork source ids without changing the boundary', async () => {
  const provenance = {
    forkedFromSessionId: 'temp-parent',
    forkedThroughMessageId: 'boundary'
  }
  await patchSessionRecord(ws, 'temp-child', { tabId: 'scratchpad', ...provenance })
  await rename('temp-child', 'child')
  await rename('temp-parent', 'parent')
  expect(await getSessionRecord(ws, 'temp-child')).toEqual({})
  const sessions = await withSessionRecords(ws, [
    { sessionId: 'child', summary: 'Title', lastModified: 1 }
  ])
  expect(sessions[0].tabId).toBe('scratchpad')
  expect(sessions[0]).toMatchObject({ ...provenance, forkedFromSessionId: 'parent' })
  expect((await Bun.file(path).json()).sessions.child.fork).toEqual({
    fromSessionId: 'parent',
    throughMessageId: 'boundary'
  })
})

test('rejects fork history without a source session', async () => {
  await expect(
    patchSessionRecord(ws, 's1', { forkedThroughMessageId: 'boundary' } as never)
  ).rejects.toThrow('Fork history requires a source session')
  expect(await getSessionRecord(ws, 's1')).toEqual({})
})

test('moves malformed stored data aside instead of overwriting it', async () => {
  await Bun.write(path, '{broken')
  await saveSessionConfig(ws, 's1', { model: 'sonnet' })
  expect(await getSessionConfig(ws, 's1')).toEqual({ model: 'sonnet' })
  const aside = (await readdir(join(directory, ws.id))).find(file => file.includes('.corrupt-'))
  expect(aside).toBeDefined()
  expect(await Bun.file(join(directory, ws.id, aside!)).text()).toBe('{broken')
})
