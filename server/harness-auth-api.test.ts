import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { harnessStore } from './harness-auth'
import { api } from './api'
import { codexHarness } from './harness/codex'
import {
  DEFAULT_REGISTRY_PATH,
  listWorkspaces,
  registerWorkspace,
  setRegistryPath
} from './registry'

const original = {
  startLogin: codexHarness.startLogin,
  authStatus: codexHarness.authStatus,
  availability: codexHarness.availability
}
let dir: string
let workspaceId: string | undefined

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'moi-harness-auth-'))
  setRegistryPath(join(dir, 'registry.json'))
  harnessStore.invalidate('codex')
  codexHarness.authStatus = async () => ({ status: 'login-required', reason: 'Signed out' })
  codexHarness.availability = async () => ({
    status: 'login-required',
    reason: 'Workspace signed out'
  })
})

afterEach(async () => {
  harnessStore.invalidate('codex')
  if (workspaceId) harnessStore.invalidate({ id: workspaceId, path: dir })
  workspaceId = undefined
  Object.assign(codexHarness, original)
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(dir, { recursive: true, force: true })
})

test('checks and starts default authentication without creating a workspace', async () => {
  let starts = 0
  codexHarness.startLogin = async () => {
    starts++
    return { url: 'https://example.com/login' }
  }
  const status = await api.request('/api/harnesses/codex/auth')
  expect(status.status).toBe(200)
  expect(status.headers.get('Cache-Control')).toBe('no-store')
  expect(await status.json()).toEqual({
    availability: { status: 'login-required', reason: 'Signed out' }
  })
  for (let i = 0; i < 2; i++) {
    const response = await api.request('/api/harnesses/codex/auth/login', { method: 'POST' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: 'https://example.com/login' })
  }
  expect(starts).toBe(1)
  const pending = await api.request('/api/harnesses/codex/auth')
  expect((await pending.json()).login).toEqual({
    state: 'pending',
    url: 'https://example.com/login'
  })
  expect(await listWorkspaces()).toEqual([])
})

test('global authentication leaves workspace readiness independent', async () => {
  const workspace = await registerWorkspace(dir, { type: 'codex' })
  workspaceId = workspace.id
  codexHarness.authStatus = async () => ({ status: 'available' })
  const status = await api.request('/api/harnesses/codex/auth')
  expect((await status.json()).availability.status).toBe('available')
  expect((await harnessStore.getAvailability(workspace)).status).toBe('login-required')
})

test('rejects unknown agents and unsupported login', async () => {
  expect((await api.request('/api/harnesses/unknown/auth')).status).toBe(404)
  expect((await api.request('/api/harnesses/hermes/auth/login', { method: 'POST' })).status).toBe(
    409
  )
})
