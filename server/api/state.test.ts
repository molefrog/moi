import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { WorkspaceEntry, WorkspaceState } from '@/lib/types'
// The API module first: it loads the harness registry before a single harness.
import { api } from './index'
import * as events from '../events'
import { claudeCodeHarness } from '../harness/claude-code'
import { DEFAULT_WORKSPACE_STATE_ROOT, setWorkspaceStateRoot } from '../workspace-state'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from '../workspaces/registry'

let tempDir = ''
let workspace: WorkspaceEntry
const originalListSessions = claudeCodeHarness.listSessions

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-api-state-'))
  setRegistryPath(join(tempDir, 'workspaces.json'))
  setWorkspaceStateRoot(join(tempDir, 'state'))
  workspace = await registerWorkspace(join(tempDir, 'workspace'), { type: 'claude-code' })
  claudeCodeHarness.listSessions = async () => [
    { sessionId: 'existing', summary: 'Existing', lastModified: 1 }
  ]
})

afterEach(async () => {
  claudeCodeHarness.listSessions = originalListSessions
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  setWorkspaceStateRoot(DEFAULT_WORKSPACE_STATE_ROOT)
  await rm(tempDir, { recursive: true, force: true })
})

function call(path: string, method = 'GET', body?: unknown) {
  return api.request(`/api/workspaces/${workspace.id}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  })
}

async function state(response: Response | Promise<Response>): Promise<WorkspaceState> {
  const resolved = await response
  expect(resolved.status).toBe(200)
  return resolved.json()
}

describe('workspace state API', () => {
  test('a fresh workspace has no pin, selections, chat settings or pending views', async () => {
    expect(await state(call('/state'))).toEqual({
      revision: 0,
      selected: {},
      sessions: {},
      pendingViews: {}
    })
  })

  test('the chat list is the agent’s, without Moi’s metadata', async () => {
    await call('/sessions/existing/selection', 'PUT', { tabId: 'views/words' })
    await call('/sessions/existing/config', 'PATCH', { model: 'sonnet' })
    expect(await (await call('/sessions')).json()).toEqual([
      { sessionId: 'existing', summary: 'Existing', lastModified: 1 }
    ])
  })

  test('a pin overrides every tab without replacing their selections', async () => {
    await state(call('/sessions/other/selection', 'PUT', { tabId: 'scratchpad' }))
    const pinned = await state(call('/sessions/existing/pin', 'PUT'))
    expect(pinned).toMatchObject({ pinnedSessionId: 'existing', selected: { scratchpad: 'other' } })

    const blocked = await call('/sessions/third/selection', 'PUT', { tabId: 'scratchpad' })
    expect(blocked.status).toBe(409)

    // Unpinning a chat that is not pinned changes nothing.
    expect((await state(call('/sessions/other/pin', 'DELETE'))).pinnedSessionId).toBe('existing')
    const unpinned = await state(call('/sessions/existing/pin', 'DELETE'))
    expect(unpinned.pinnedSessionId).toBeUndefined()
    expect(unpinned.selected).toEqual({ scratchpad: 'other' })
  })

  test('pinning a chat the agent does not know is refused', async () => {
    expect((await call('/sessions/missing/pin', 'PUT')).status).toBe(404)
  })

  test('ifMatch applies a selection only while the tab still shows that chat', async () => {
    await state(call('/sessions/real/selection', 'PUT', { tabId: 'overview' }))
    const stale = await state(
      call('/sessions/temporary/selection', 'PUT', { tabId: 'overview', ifMatch: null })
    )
    expect(stale.selected.overview).toBe('real')
    const current = await state(
      call('/sessions/next/selection', 'PUT', { tabId: 'overview', ifMatch: 'real' })
    )
    expect(current.selected.overview).toBe('next')
  })

  test('deselecting clears the tab only while it shows that chat', async () => {
    await state(call('/sessions/shown/selection', 'PUT', { tabId: 'overview' }))
    expect(
      (await state(call('/sessions/other/selection', 'DELETE', { tabId: 'overview' }))).selected
    ).toEqual({ overview: 'shown' })
    expect(
      (await state(call('/sessions/shown/selection', 'DELETE', { tabId: 'overview' }))).selected
    ).toEqual({})
  })

  test('rejects bad selection input', async () => {
    expect((await call('/sessions/a/selection', 'PUT', { tabId: 'nowhere' })).status).toBe(400)
    expect(
      (await call('/sessions/a/selection', 'PUT', { tabId: 'overview', ifMatch: 3 })).status
    ).toBe(400)
    expect((await call('/sessions/a/selection', 'DELETE')).status).toBe(400)
  })

  test('chat settings patch merges fields and null clears one', async () => {
    await state(call('/sessions/s1/config', 'PATCH', { model: 'sonnet', effort: 'high' }))
    const patched = await state(
      call('/sessions/s1/config', 'PATCH', { effort: null, fastMode: true })
    )
    expect(patched.sessions.s1).toEqual({ config: { model: 'sonnet', fastMode: true } })
    expect((await call('/sessions/s1/config', 'PATCH', { fastMode: 'yes' })).status).toBe(400)
  })

  test('every write publishes the new state', async () => {
    const publish = spyOn(events, 'publishEvent').mockImplementation(() => {})
    try {
      const saved = await state(call('/sessions/existing/pin', 'PUT'))
      expect(publish).toHaveBeenCalledWith({
        type: 'state:changed',
        workspaceId: workspace.id,
        state: saved
      })
    } finally {
      publish.mockRestore()
    }
  })
})
