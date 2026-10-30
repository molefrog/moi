import { afterEach, beforeEach, expect, test } from 'bun:test'
import { DEFAULT_WORKSPACE_STATE_ROOT, setWorkspaceStateRoot } from '../workspace-state'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { api } from './index'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from '../workspaces/registry'
import { getSessionEntry, updateSessionEntry } from '../sessions/store'
import { harnessFor } from '../harness/registry'
import type { StreamEvent } from '@/lib/types'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'moi-api-session-'))
  setRegistryPath(join(directory, 'workspaces.json'))
  setWorkspaceStateRoot(join(directory, 'state'))
})
afterEach(async () => {
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  setWorkspaceStateRoot(DEFAULT_WORKSPACE_STATE_ROOT)
  await rm(directory, { recursive: true, force: true })
})

test('history retries without changing a fork cutoff', async () => {
  const workspace = await registerWorkspace(join(directory, 'workspace'), { type: 'claude-code' })
  const path = `/api/workspaces/${workspace.id}/sessions/child/events`
  const harness = harnessFor(workspace)
  const original = harness.sessionEvents
  let reads = 0
  let failRead = true
  let history: StreamEvent[] = []
  harness.sessionEvents = async () => {
    reads++
    if (failRead) throw new Error('History unavailable')
    return history
  }
  try {
    // An ordinary chat uses the same read and retry path.
    expect((await api.request(path)).status).toBe(500)
    failRead = false
    expect((await api.request(path)).status).toBe(200)
    await updateSessionEntry(workspace, 'child', { fork: { fromSessionId: 'parent' } })
    failRead = true
    expect((await api.request(path)).status).toBe(500)
    expect(await getSessionEntry(workspace, 'child')).toEqual({
      fork: { fromSessionId: 'parent' }
    })
    failRead = false
    expect((await api.request(path)).status).toBe(200)
    expect(await getSessionEntry(workspace, 'child')).toEqual({
      fork: { fromSessionId: 'parent' }
    })
    history = [
      {
        kind: 'turn',
        turn: {
          id: 'new-message',
          role: 'user',
          origin: { kind: 'user-input' },
          parts: []
        }
      }
    ]
    expect((await api.request(path)).status).toBe(200)
    expect(await getSessionEntry(workspace, 'child')).toEqual({
      fork: { fromSessionId: 'parent' }
    })
    expect(reads).toBe(5)
  } finally {
    harness.sessionEvents = original
  }
})

test('changing chat settings keeps the chat’s tab and fork history', async () => {
  const workspace = await registerWorkspace(join(directory, 'workspace'), { type: 'claude-code' })
  const entry = {
    tabId: 'scratchpad' as const,
    fork: { fromSessionId: 'parent', throughMessageId: 'boundary' }
  }
  await updateSessionEntry(workspace, 'child', entry)
  const patch = (body: unknown) =>
    api.request(`/api/workspaces/${workspace.id}/sessions/child/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  const saved = await patch({ model: 'sonnet', fastMode: false })
  expect(saved.status).toBe(200)
  expect((await saved.json()).sessions.child).toEqual({
    ...entry,
    config: { model: 'sonnet', fastMode: false }
  })
  const ultrafast = await patch({ fastMode: 'ultrafast' })
  expect(ultrafast.status).toBe(200)
  expect((await ultrafast.json()).sessions.child.config.fastMode).toBe('ultrafast')
  expect((await patch({ fastMode: 'turbo' })).status).toBe(400)
  expect((await (await patch({ model: null, fastMode: null })).json()).sessions.child).toEqual(
    entry
  )
})
