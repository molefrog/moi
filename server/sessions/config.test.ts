import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEFAULT_WORKSPACE_STATE_ROOT,
  setWorkspaceStateRoot,
  updateWorkspaceState
} from '../workspace-state'
import { getSessionConfig, saveSessionConfig } from './config'
import { renameSessionEntry } from './store'

let scratchDir = ''
const ws = { id: 'ws-1', path: '/workspace' }

beforeEach(async () => {
  scratchDir = await mkdtemp(join(tmpdir(), 'moi-session-config-'))
  setWorkspaceStateRoot(scratchDir)
})

afterEach(async () => {
  setWorkspaceStateRoot(DEFAULT_WORKSPACE_STATE_ROOT)
  await rm(scratchDir, { recursive: true, force: true })
})

describe('session Fast mode config', () => {
  test('preserves explicit false and clears only when asked', async () => {
    await saveSessionConfig(ws, 'session-1', {
      model: 'sonnet',
      fastMode: false
    })
    expect(await getSessionConfig(ws, 'session-1')).toEqual({
      model: 'sonnet',
      fastMode: false
    })

    await saveSessionConfig(ws, 'session-1', { fastMode: null })
    expect(await getSessionConfig(ws, 'session-1')).toEqual({ model: 'sonnet' })
  })

  test('keeps false when a temporary session config is renamed', async () => {
    await saveSessionConfig(ws, 'temporary', { fastMode: false })
    await updateWorkspaceState(ws, state => renameSessionEntry(state, 'temporary', 'real'))

    expect(await getSessionConfig(ws, 'temporary')).toEqual({})
    expect(await getSessionConfig(ws, 'real')).toEqual({ fastMode: false })
  })
})
