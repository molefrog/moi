import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEFAULT_SELECTED_SESSION_PATH,
  clearSelectedSession,
  getSelectedSession,
  initializeSelectedSession,
  renameSelectedSession,
  saveSelectedSession,
  setSelectedSessionPath
} from './selected-session'

let scratchDir = ''

beforeEach(async () => {
  scratchDir = await mkdtemp(join(tmpdir(), 'moi-selected-session-'))
  setSelectedSessionPath(join(scratchDir, 'selected-sessions.json'))
})

afterEach(async () => {
  setSelectedSessionPath(DEFAULT_SELECTED_SESSION_PATH)
  await rm(scratchDir, { recursive: true, force: true })
})

describe('selected session persistence', () => {
  test('distinguishes an unset workspace from an explicit new session', async () => {
    expect(await getSelectedSession('/workspace')).toBeUndefined()
    expect(await initializeSelectedSession('/workspace', null)).toBeNull()
    expect(await initializeSelectedSession('/workspace', 'recent')).toBeNull()
    expect(await getSelectedSession('/workspace')).toBeNull()
  })

  test('serializes writes for different workspaces without dropping either value', async () => {
    await Promise.all([
      saveSelectedSession('/first', 'session-1'),
      saveSelectedSession('/second', 'session-2')
    ])

    expect(await getSelectedSession('/first')).toBe('session-1')
    expect(await getSelectedSession('/second')).toBe('session-2')
  })

  test('rapid selections finish on the latest session', async () => {
    await saveSelectedSession('/workspace', 'session-1')

    await Promise.all([
      saveSelectedSession('/workspace', 'session-2', 'session-1'),
      saveSelectedSession('/workspace', 'session-3', 'session-2')
    ])

    expect(await getSelectedSession('/workspace')).toBe('session-3')
  })

  test('renames a selected temporary session and rejects a late stale save', async () => {
    await initializeSelectedSession('/workspace', null)
    await saveSelectedSession('/workspace', 'temporary', null)
    expect(await renameSelectedSession('/workspace', 'temporary', 'real')).toEqual({
      changed: true,
      sessionId: 'real'
    })

    expect(await saveSelectedSession('/workspace', 'temporary', null)).toEqual({
      changed: false,
      sessionId: 'real'
    })
    expect(await getSelectedSession('/workspace')).toBe('real')
  })

  test('clears only the matching selected session', async () => {
    await saveSelectedSession('/workspace', 'selected')
    expect(await clearSelectedSession('/workspace', 'other')).toEqual({
      changed: false,
      sessionId: 'selected'
    })
    expect(await clearSelectedSession('/workspace', 'selected')).toEqual({
      changed: true,
      sessionId: null
    })
  })
})
