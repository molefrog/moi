import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { DEFAULT_WORKSPACE_STATE_ROOT, setWorkspaceStateRoot } from '../workspace-state'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { api } from './index'
import { claudeCodeHarness } from '../harness/claude-code'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from '../workspaces/registry'
import { getSelectedSession } from '../sessions/selected'

let tempDir = ''
const originalListSessions = claudeCodeHarness.listSessions

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-api-selected-session-'))
  setRegistryPath(join(tempDir, 'workspaces.json'))
  setWorkspaceStateRoot(join(tempDir, 'state'))
})

afterEach(async () => {
  claudeCodeHarness.listSessions = originalListSessions
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  setWorkspaceStateRoot(DEFAULT_WORKSPACE_STATE_ROOT)
  await rm(tempDir, { recursive: true, force: true })
})

describe('selected session API', () => {
  test('fresh view and Scratchpad selections stay empty; a workspace pin overrides without replacing them', async () => {
    const workspace = await registerWorkspace(join(tempDir, 'workspace'), { type: 'claude-code' })
    claudeCodeHarness.listSessions = async () => [
      { sessionId: 'existing', summary: 'Existing', lastModified: 1 }
    ]
    const path = `/api/workspaces/${workspace.id}`
    for (const tabId of ['views/words', 'scratchpad']) {
      expect(await (await api.request(`${path}/selected-session?tabId=${tabId}`)).json()).toEqual({
        selected: {},
        pinned: null
      })
    }
    const pin = await api.request(`${path}/pinned-session`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'existing' })
    })
    expect(pin.status).toBe(200)
    expect(await (await api.request(`${path}/selected-session?tabId=scratchpad`)).json()).toEqual({
      selected: {},
      pinned: 'existing'
    })
    const change = await api.request(`${path}/selected-session`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: null, tabId: 'scratchpad' })
    })
    expect(change.status).toBe(409)
    await api.request(`${path}/pinned-session`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: null })
    })
    expect(await (await api.request(`${path}/selected-session?tabId=scratchpad`)).json()).toEqual({
      selected: {},
      pinned: null
    })
  })
  test('starts with a fresh composer when there is no remembered selection', async () => {
    const workspace = await registerWorkspace(join(tempDir, 'workspace'), {
      type: 'claude-code'
    })
    claudeCodeHarness.listSessions = async () => [
      { sessionId: 'older', summary: 'Older', lastModified: 10 },
      { sessionId: 'newer', summary: 'Newer', lastModified: 20 }
    ]

    const response = await api.request(`/api/workspaces/${workspace.id}/selected-session`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ selected: {}, pinned: null })
    expect(await getSelectedSession(workspace)).toBeUndefined()
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
    expect(await loaded.json()).toEqual({ selected: {}, pinned: null })
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
    expect(await getSelectedSession(workspace)).toBe('real')
  })
})
