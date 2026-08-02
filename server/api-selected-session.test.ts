import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { api } from './api'
import { claudeCodeHarness } from './harness/claude-code'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'
import {
  DEFAULT_SELECTED_SESSION_PATH,
  getSelectedSession,
  setSelectedSessionPath
} from './selected-session'

let tempDir = ''
const originalListSessions = claudeCodeHarness.listSessions

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-api-selected-session-'))
  setRegistryPath(join(tempDir, 'workspaces.json'))
  setSelectedSessionPath(join(tempDir, 'selected-sessions.json'))
})

afterEach(async () => {
  claudeCodeHarness.listSessions = originalListSessions
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  setSelectedSessionPath(DEFAULT_SELECTED_SESSION_PATH)
  await rm(tempDir, { recursive: true, force: true })
})

describe('selected session API', () => {
  test('initializes an unset workspace to its most recently modified session', async () => {
    const workspace = await registerWorkspace(join(tempDir, 'workspace'), {
      type: 'claude-code'
    })
    claudeCodeHarness.listSessions = async () => [
      { sessionId: 'older', summary: 'Older', lastModified: 10 },
      { sessionId: 'newer', summary: 'Newer', lastModified: 20 }
    ]

    const response = await api.request(`/api/workspaces/${workspace.id}/selected-session`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sessionId: 'newer' })
    expect(await getSelectedSession(workspace.path)).toBe('newer')
  })

  test('preserves an explicit New chat selection on later reads', async () => {
    const workspace = await registerWorkspace(join(tempDir, 'workspace'), {
      type: 'claude-code'
    })
    claudeCodeHarness.listSessions = async () => [
      { sessionId: 'recent', summary: 'Recent', lastModified: 20 }
    ]

    const saved = await api.request(`/api/workspaces/${workspace.id}/selected-session`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: null })
    })
    const loaded = await api.request(`/api/workspaces/${workspace.id}/selected-session`)

    expect(saved.status).toBe(200)
    expect(await loaded.json()).toEqual({ sessionId: null })
  })

  test('rejects a stale conditional write and returns the stored session', async () => {
    const workspace = await registerWorkspace(join(tempDir, 'workspace'), {
      type: 'claude-code'
    })
    await api.request(`/api/workspaces/${workspace.id}/selected-session`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'real' })
    })

    const response = await api.request(`/api/workspaces/${workspace.id}/selected-session`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'temporary', previousSessionId: null })
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sessionId: 'real' })
    expect(await getSelectedSession(workspace.path)).toBe('real')
  })
})
