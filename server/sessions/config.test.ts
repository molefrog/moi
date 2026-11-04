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
  test('Ultrafast survives a disk reload and a session rename', async () => {
    await saveSessionConfig(ws, 'temporary', { speedMode: 'ultrafast' })
    setWorkspaceStateRoot(scratchDir)
    expect(await getSessionConfig(ws, 'temporary')).toEqual({ speedMode: 'ultrafast' })
    await updateWorkspaceState(ws, state => renameSessionEntry(state, 'temporary', 'real'))
    expect(await getSessionConfig(ws, 'real')).toEqual({ speedMode: 'ultrafast' })
    await saveSessionConfig(ws, 'real', { speedMode: 'normal' })
    expect(await getSessionConfig(ws, 'real')).toEqual({ speedMode: 'normal' })
  })
  test('preserves explicit normal and clears only when asked', async () => {
    await saveSessionConfig(ws, 'session-1', {
      model: 'sonnet',
      speedMode: 'normal'
    })
    expect(await getSessionConfig(ws, 'session-1')).toEqual({
      model: 'sonnet',
      speedMode: 'normal'
    })

    await saveSessionConfig(ws, 'session-1', { speedMode: null })
    expect(await getSessionConfig(ws, 'session-1')).toEqual({ model: 'sonnet' })
  })

  test('keeps normal when a temporary session config is renamed', async () => {
    await saveSessionConfig(ws, 'temporary', { speedMode: 'normal' })
    await updateWorkspaceState(ws, state => renameSessionEntry(state, 'temporary', 'real'))

    expect(await getSessionConfig(ws, 'temporary')).toEqual({})
    expect(await getSessionConfig(ws, 'real')).toEqual({ speedMode: 'normal' })
  })
})

test.each([
  { saved: { fastMode: true }, expected: undefined },
  { saved: { fastMode: false }, expected: undefined },
  { saved: { fastMode: 'ultrafast' }, expected: undefined },
  { saved: { speedMode: false }, expected: undefined },
  { saved: { speedMode: 'normal', fastMode: true }, expected: 'normal' },
  { saved: { speedMode: 'fast' }, expected: 'fast' },
  { saved: { speedMode: 'ultrafast' }, expected: 'ultrafast' },
  { saved: {}, expected: undefined },
  { saved: { speedMode: 'unknown' }, expected: undefined }
])('loads and rewrites saved speed settings: $saved', async ({ saved, expected }) => {
  const path = join(scratchDir, ws.id, 'state.json')
  await Bun.write(
    path,
    JSON.stringify({
      version: 1,
      workspacePath: ws.path,
      sessions: { saved: { config: saved } }
    })
  )
  expect((await getSessionConfig(ws, 'saved')).speedMode).toBe(expected)
  await saveSessionConfig(ws, 'saved', { effort: 'high' })
  const config = (await Bun.file(path).json()).sessions.saved.config
  expect(config.speedMode).toBe(expected)
  expect(config).not.toHaveProperty('fastMode')
})
