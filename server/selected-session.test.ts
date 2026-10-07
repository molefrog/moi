import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEFAULT_SELECTED_SESSION_PATH,
  clearSelectedSession,
  getSelectedSession,
  getPinnedSession,
  pinSession,
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
  test('tabId selection and workspace pin are independent', async () => {
    await saveSelectedSession('/workspace', 'general')
    await saveSelectedSession('/workspace', 'words', undefined, 'views/words')
    await saveSelectedSession('/workspace', 'sketch', undefined, 'scratchpad')
    expect(await getSelectedSession('/workspace', 'views/genders')).toBeUndefined()
    await pinSession('/workspace', 'words')
    expect(await getPinnedSession('/workspace')).toBe('words')
    expect(await getSelectedSession('/workspace', 'scratchpad')).toBe('sketch')
    await pinSession('/workspace', null)
    expect(await getSelectedSession('/workspace', 'views/words')).toBe('words')
    expect(await getSelectedSession('/workspace')).toBe('general')
  })

  test('archiving clears both tab selection and the workspace pin', async () => {
    await saveSelectedSession('/workspace', 'build', undefined, 'views/words')
    await pinSession('/workspace', 'build')
    expect(await getSelectedSession('/workspace', 'views/words')).toBe('build')
    await clearSelectedSession('/workspace', 'build')
    expect(await getSelectedSession('/workspace', 'views/words')).toBeUndefined()
    expect(await getPinnedSession('/workspace')).toBeNull()
  })

  test('legacy workspace selection loads as overview without pinning', async () => {
    await Bun.write(
      join(scratchDir, 'selected-sessions.json'),
      JSON.stringify({ '/workspace': 'legacy' })
    )
    expect(await getSelectedSession('/workspace')).toBe('legacy')
    expect(await getSelectedSession('/workspace', 'scratchpad')).toBeUndefined()
    expect(await getPinnedSession('/workspace')).toBeNull()
  })
  test('New chat removes the remembered selection', async () => {
    expect(await getSelectedSession('/workspace')).toBeUndefined()
    await saveSelectedSession('/workspace', 'session-1')
    await saveSelectedSession('/workspace', null)
    expect(await getSelectedSession('/workspace')).toBeUndefined()
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
    await saveSelectedSession('/workspace', null)
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

  test('resolves a temporary selection saved after its session was renamed', async () => {
    await saveSelectedSession('/workspace', null)

    expect(await renameSelectedSession('/workspace', 'temporary', 'real')).toEqual({
      changed: false,
      sessionId: null
    })
    expect(await saveSelectedSession('/workspace', 'temporary', null)).toEqual({
      changed: true,
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
