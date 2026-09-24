import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { api } from './api'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'
import {
  DEFAULT_SESSION_STORE_PATH,
  getSessionRecord,
  patchSessionRecord,
  setSessionStorePath
} from './session-store'
import { harnessFor } from './harness/registry'
import type { StreamEvent } from '@/lib/types'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'moi-api-session-'))
  setRegistryPath(join(directory, 'workspaces.json'))
  setSessionStorePath(join(directory, 'sessions.json'))
})
afterEach(async () => {
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  setSessionStorePath(DEFAULT_SESSION_STORE_PATH)
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
    await patchSessionRecord(workspace.path, 'child', { forkedFromSessionId: 'parent' })
    failRead = true
    expect((await api.request(path)).status).toBe(500)
    expect(await getSessionRecord(workspace.path, 'child')).toEqual({
      forkedFromSessionId: 'parent'
    })
    failRead = false
    expect((await api.request(path)).status).toBe(200)
    expect(await getSessionRecord(workspace.path, 'child')).toEqual({
      forkedFromSessionId: 'parent'
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
    expect(await getSessionRecord(workspace.path, 'child')).toEqual({
      forkedFromSessionId: 'parent'
    })
    expect(reads).toBe(5)
  } finally {
    harness.sessionEvents = original
  }
})

test('reads one session record and preserves provenance when updating or clearing config', async () => {
  const workspace = await registerWorkspace(join(directory, 'workspace'), { type: 'claude-code' })
  const path = `/api/workspaces/${workspace.id}/sessions/child`
  const metadata = {
    tabId: 'scratchpad' as const,
    forkedFromSessionId: 'parent',
    forkedThroughMessageId: 'boundary'
  }
  await patchSessionRecord(workspace.path, 'child', metadata)
  const patch = (body: unknown) =>
    api.request(`${path}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  const saved = await patch({ model: 'sonnet', fastMode: false })
  expect(saved.status).toBe(200)
  const expected = { ...metadata, config: { model: 'sonnet', fastMode: false } }
  expect(await saved.json()).toEqual(expected)
  expect(await (await api.request(path)).json()).toEqual(expected)
  expect(await (await patch({ model: null, fastMode: null })).json()).toEqual(metadata)
  expect(
    await (await api.request(`/api/workspaces/${workspace.id}/sessions/fresh`)).json()
  ).toEqual({})
})
