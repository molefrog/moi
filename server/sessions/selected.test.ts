import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEFAULT_WORKSPACE_STATE_ROOT,
  readWorkspaceState,
  setWorkspaceStateRoot
} from '../workspace-state'
import { renameSessionReferences } from './lifecycle'
import {
  clearSelectedSession,
  forgetSessionRenames,
  getSelectedSession,
  getPinnedSession,
  pinSession,
  saveSelectedSession
} from './selected'
import { patchSessionRecord } from './store'

let scratchDir = ''
const ws = { id: 'ws-1', path: '/workspace' }

beforeEach(async () => {
  scratchDir = await mkdtemp(join(tmpdir(), 'moi-selected-session-'))
  setWorkspaceStateRoot(scratchDir)
  forgetSessionRenames()
})

afterEach(async () => {
  setWorkspaceStateRoot(DEFAULT_WORKSPACE_STATE_ROOT)
  await rm(scratchDir, { recursive: true, force: true })
})

describe('selected session persistence', () => {
  test('tabId selection and workspace pin are independent', async () => {
    await saveSelectedSession(ws, 'general')
    await saveSelectedSession(ws, 'words', undefined, 'views/words')
    await saveSelectedSession(ws, 'sketch', undefined, 'scratchpad')
    expect(await getSelectedSession(ws, 'views/genders')).toBeUndefined()
    await pinSession(ws, 'words')
    expect(await getPinnedSession(ws)).toBe('words')
    expect(await getSelectedSession(ws, 'scratchpad')).toBe('sketch')
    await pinSession(ws, null)
    expect(await getSelectedSession(ws, 'views/words')).toBe('words')
    expect(await getSelectedSession(ws)).toBe('general')
  })

  test('archiving clears both tab selection and the workspace pin', async () => {
    await saveSelectedSession(ws, 'build', undefined, 'views/words')
    await pinSession(ws, 'build')
    expect(await getSelectedSession(ws, 'views/words')).toBe('build')
    await clearSelectedSession(ws, 'build')
    expect(await getSelectedSession(ws, 'views/words')).toBeUndefined()
    expect(await getPinnedSession(ws)).toBeNull()
  })

  test('New chat removes the remembered selection', async () => {
    expect(await getSelectedSession(ws)).toBeUndefined()
    await saveSelectedSession(ws, 'session-1')
    await saveSelectedSession(ws, null)
    expect(await getSelectedSession(ws)).toBeUndefined()
  })

  test('serializes writes for different workspaces without dropping either value', async () => {
    const first = { id: 'first', path: '/first' }
    const second = { id: 'second', path: '/second' }
    await Promise.all([
      saveSelectedSession(first, 'session-1'),
      saveSelectedSession(second, 'session-2')
    ])

    expect(await getSelectedSession(first)).toBe('session-1')
    expect(await getSelectedSession(second)).toBe('session-2')
  })

  test('rapid selections finish on the latest session', async () => {
    await saveSelectedSession(ws, 'session-1')

    await Promise.all([
      saveSelectedSession(ws, 'session-2', 'session-1'),
      saveSelectedSession(ws, 'session-3', 'session-2')
    ])

    expect(await getSelectedSession(ws)).toBe('session-3')
  })

  test('renames a selected temporary session and rejects a late stale save', async () => {
    await saveSelectedSession(ws, null)
    await saveSelectedSession(ws, 'temporary', null)
    await renameSessionReferences(ws, 'temporary', 'real')
    expect(await getSelectedSession(ws)).toBe('real')

    expect(await saveSelectedSession(ws, 'temporary', null)).toEqual({
      changed: false,
      sessionId: 'real'
    })
    expect(await getSelectedSession(ws)).toBe('real')
  })

  test('resolves a temporary selection saved after its session was renamed', async () => {
    await saveSelectedSession(ws, null)
    await renameSessionReferences(ws, 'temporary', 'real')

    expect(await saveSelectedSession(ws, 'temporary', null)).toEqual({
      changed: true,
      sessionId: 'real'
    })
    expect(await getSelectedSession(ws)).toBe('real')
  })

  test('a rename moves the record, every tab and the pin in one write', async () => {
    await patchSessionRecord(ws, 'temporary', { tabId: 'views/words' })
    await saveSelectedSession(ws, 'temporary', undefined, 'views/words')
    await saveSelectedSession(ws, 'temporary')
    await pinSession(ws, 'temporary')
    await renameSessionReferences(ws, 'temporary', 'real')

    const state = await readWorkspaceState(ws)
    expect(state.selected).toEqual({ overview: 'real', 'views/words': 'real' })
    expect(state.pinnedSessionId).toBe('real')
    expect(state.sessions).toEqual({ real: { tabId: 'views/words' } })
  })

  test('clears only the matching selected session', async () => {
    await saveSelectedSession(ws, 'selected')
    expect(await clearSelectedSession(ws, 'other')).toEqual({
      changed: false,
      sessionId: 'selected'
    })
    expect(await clearSelectedSession(ws, 'selected')).toEqual({
      changed: true,
      sessionId: null
    })
  })
})
