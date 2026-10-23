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
import { getSessionEntry, renameSessionEntry, updateSessionEntry } from './store'

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

test('concurrent config and tab updates share one entry', async () => {
  await Promise.all([
    saveSessionConfig(ws, 's1', { model: 'sonnet', fastMode: false }),
    updateSessionEntry(ws, 's1', { tabId: 'scratchpad' })
  ])
  expect((await Bun.file(path).json()).sessions).toEqual({
    s1: { config: { model: 'sonnet', fastMode: false }, tabId: 'scratchpad' }
  })
  await saveSessionConfig(ws, 's1', { model: null, fastMode: null })
  expect(await getSessionConfig(ws, 's1')).toEqual({})
  expect(await getSessionEntry(ws, 's1')).toEqual({ tabId: 'scratchpad' })
})

test('renaming a session moves the whole entry and preserves destination config overrides', async () => {
  await saveSessionConfig(ws, 'temporary', { model: 'sonnet', effort: 'high' })
  await updateSessionEntry(ws, 'temporary', { tabId: 'scratchpad' })
  await saveSessionConfig(ws, 'native', { model: 'opus' })
  await rename('temporary', 'native')
  expect(await getSessionEntry(ws, 'native')).toEqual({
    config: { model: 'opus', effort: 'high' },
    tabId: 'scratchpad'
  })
  expect((await Bun.file(path).json()).sessions.temporary).toBeUndefined()
})

test('session renames move the entry and fork source ids without changing the boundary', async () => {
  await updateSessionEntry(ws, 'temp-child', {
    tabId: 'scratchpad',
    fork: { fromSessionId: 'temp-parent', throughMessageId: 'boundary' }
  })
  await rename('temp-child', 'child')
  await rename('temp-parent', 'parent')
  expect(await getSessionEntry(ws, 'temp-child')).toEqual({})
  expect(await getSessionEntry(ws, 'child')).toEqual({
    tabId: 'scratchpad',
    fork: { fromSessionId: 'parent', throughMessageId: 'boundary' }
  })
})

test('clearing a field with undefined removes it from the file', async () => {
  await updateSessionEntry(ws, 's1', { tabId: 'scratchpad', config: { model: 'sonnet' } })
  await updateSessionEntry(ws, 's1', { tabId: undefined })
  expect((await Bun.file(path).json()).sessions.s1).toEqual({ config: { model: 'sonnet' } })
})

test('moves malformed stored data aside instead of overwriting it', async () => {
  await Bun.write(path, '{broken')
  await saveSessionConfig(ws, 's1', { model: 'sonnet' })
  expect(await getSessionConfig(ws, 's1')).toEqual({ model: 'sonnet' })
  const aside = (await readdir(join(directory, ws.id))).find(file => file.includes('.corrupt-'))
  expect(aside).toBeDefined()
  expect(await Bun.file(join(directory, ws.id, aside!)).text()).toBe('{broken')
})
