import { claudeCodeHarness } from '../harness/claude-code'
import * as installer from '../harness/install'
import * as shellPath from '../harness/shell-path'
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { harnessStore } from '../harness/auth'
import { api } from './index'
import { codexHarness } from '../harness/codex'
import {
  DEFAULT_REGISTRY_PATH,
  listWorkspaces,
  registerWorkspace,
  setRegistryPath
} from '../workspaces/registry'

const original = {
  startLogin: codexHarness.startLogin,
  authStatus: codexHarness.authStatus,
  availability: codexHarness.availability
}
let claudeAuth: ReturnType<typeof spyOn<typeof claudeCodeHarness, 'authStatus'>>
let claudeRuntime: ReturnType<typeof spyOn<typeof claudeCodeHarness, 'availability'>>
let dir: string
let workspaceId: string | undefined

beforeEach(async () => {
  claudeAuth = spyOn(claudeCodeHarness, 'authStatus').mockResolvedValue({ status: 'available' })
  claudeRuntime = spyOn(claudeCodeHarness, 'availability').mockResolvedValue({
    status: 'available'
  })
  dir = await mkdtemp(join(tmpdir(), 'moi-harness-auth-'))
  setRegistryPath(join(dir, 'registry.json'))
  harnessStore.invalidate('codex')
  codexHarness.authStatus = async () => ({ status: 'login-required', reason: 'Signed out' })
  codexHarness.availability = async ws =>
    ws
      ? {
          status: 'login-required',
          reason: 'Workspace signed out'
        }
      : { status: 'available' }
})

afterEach(async () => {
  claudeAuth.mockRestore()
  claudeRuntime.mockRestore()
  harnessStore.invalidate('claude-code')
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
    return { id: 'attempt', url: 'https://example.com/login' }
  }
  const status = await api.request('/api/harnesses/status?refresh=true')
  expect(status.status).toBe(200)
  expect(status.headers.get('Cache-Control')).toBe('no-store')
  expect((await status.json()).codex).toEqual({
    availability: { status: 'login-required', reason: 'Signed out' }
  })
  for (let i = 0; i < 2; i++) {
    const response = await api.request('/api/harnesses/codex/auth/login', { method: 'POST' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 'attempt', url: 'https://example.com/login' })
  }
  expect(starts).toBe(1)
  const pending = await api.request('/api/harnesses/status?refresh=true')
  expect((await pending.json()).codex.login).toEqual({
    state: 'pending',
    id: 'attempt',
    url: 'https://example.com/login'
  })
  expect(await listWorkspaces()).toEqual([])
})

test('global authentication leaves workspace readiness independent', async () => {
  const workspace = await registerWorkspace(dir, { type: 'codex' })
  workspaceId = workspace.id
  codexHarness.authStatus = async () => ({ status: 'available' })
  const status = await api.request('/api/harnesses/status?refresh=true')
  expect((await status.json()).codex.availability.status).toBe('available')
  expect((await harnessStore.getAvailability(workspace)).status).toBe('login-required')
})

test('rejects unknown agents and unsupported login', async () => {
  expect((await api.request('/api/harnesses/unknown/status?refresh=true')).status).toBe(404)
  expect((await api.request('/api/harnesses/hermes/auth/login', { method: 'POST' })).status).toBe(
    409
  )
})

test('code endpoint validates input and attempt identity', async () => {
  let submitted = ''
  codexHarness.startLogin = async () => ({
    id: 'test-attempt',
    url: 'https://example.com',
    codeUrl: 'https://example.com/manual',
    submitCode: code => {
      submitted = code
    }
  })
  await api.request('/api/harnesses/codex/auth/login', { method: 'POST' })
  const submit = (id: string, code: unknown) =>
    api.request(`/api/harnesses/codex/auth/login/${id}/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    })
  expect((await submit('test-attempt', '')).status).toBe(400)
  expect((await submit('test-attempt', 123)).status).toBe(400)
  expect((await submit('old-attempt', 'code')).status).toBe(400)
  expect((await submit('test-attempt', 'code#state')).status).toBe(200)
  expect(submitted).toBe('code#state')
})

test('workspace navigation does not probe shared authentication', async () => {
  const workspace = await registerWorkspace(dir, { type: 'codex' })
  await Bun.write(join(dir, '.env'), 'DATABASE_URL=postgres://localhost/test\n')
  const auth = spyOn(codexHarness, 'authStatus')
  const availability = spyOn(codexHarness, 'availability')
  const models = spyOn(codexHarness, 'listModels').mockResolvedValue([])
  try {
    const response = await api.request(`/api/workspaces/${workspace.id}/harness`)
    expect(response.status).toBe(200)
    expect((await response.json()).hasAuthOverrides).toBe(false)
    expect(auth).not.toHaveBeenCalled()
    expect(availability).not.toHaveBeenCalled()
  } finally {
    auth.mockRestore()
    availability.mockRestore()
    models.mockRestore()
  }
})

test('shared recovery refreshes PATH and bypasses cached status', async () => {
  const path = spyOn(shellPath, 'loginShellPath').mockResolvedValue('/test/bin')
  try {
    await harnessStore.getAvailability('codex')
    codexHarness.authStatus = async () => ({ status: 'available' })
    const response = await api.request('/api/harnesses/status?refresh=true')
    expect((await response.json()).codex.availability.status).toBe('available')
    expect(path).toHaveBeenCalledWith({ refresh: true })
  } finally {
    path.mockRestore()
  }
})

test('missing workspace folder is reported before starting the harness', async () => {
  const path = join(dir, 'missing-workspace')
  const workspace = await registerWorkspace(path, { type: 'codex' })
  workspaceId = workspace.id
  const availabilitySpy = spyOn(codexHarness, 'availability')
  const modelsSpy = spyOn(codexHarness, 'listModels')
  try {
    const response = await api.request(`/api/workspaces/${workspace.id}/harness?refresh=true`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      isFolderMissing: true,
      availability: { status: 'unavailable', reason: 'Workspace folder not found' },
      models: []
    })
    expect(availabilitySpy).not.toHaveBeenCalled()
    expect(modelsSpy).not.toHaveBeenCalled()
  } finally {
    availabilitySpy.mockRestore()
    modelsSpy.mockRestore()
  }
})

test('installation refreshes cached auth and rejects cross-origin requests', async () => {
  const install = spyOn(installer, 'installHarness').mockResolvedValue()
  try {
    await harnessStore.getAvailability('codex')
    codexHarness.authStatus = async () => ({ status: 'available' })
    const blocked = await api.request('/api/harnesses/codex/auth/install', {
      method: 'POST',
      headers: { Origin: 'https://other.example' }
    })
    expect(blocked.status).toBe(403)
    expect(install).not.toHaveBeenCalled()
    const response = await api.request('/api/harnesses/codex/auth/install', { method: 'POST' })
    expect(response.status).toBe(200)
    expect(install).toHaveBeenCalledWith('codex')
    expect((await harnessStore.getAvailability('codex')).status).toBe('available')
  } finally {
    install.mockRestore()
  }
})

test('workspace environment readiness stays separate from the shared account', async () => {
  const workspace = await registerWorkspace(dir, { type: 'codex' })
  workspaceId = workspace.id
  await Bun.write(join(dir, '.env'), 'OPENAI_API_KEY=test-workspace-key\n')
  codexHarness.authStatus = async () => ({ status: 'available' })
  const models = spyOn(codexHarness, 'listModels').mockResolvedValue([])
  try {
    const response = await api.request(`/api/workspaces/${workspace.id}/harness`)
    expect(await response.json()).toMatchObject({
      hasAuthOverrides: true,
      availability: { status: 'login-required', reason: 'Workspace signed out' }
    })
    const status = await api.request('/api/harnesses/status')
    expect((await status.json()).codex.availability.status).toBe('available')
  } finally {
    models.mockRestore()
  }
})

test('starting login does not fan out checks to registered workspaces', async () => {
  await registerWorkspace(dir, { type: 'codex' })
  await registerWorkspace(join(dir, 'second'), { type: 'codex' })
  codexHarness.startLogin = async () => ({ id: 'shared', url: 'https://example.com/login' })
  const availability = spyOn(codexHarness, 'availability')
  try {
    const response = await api.request('/api/harnesses/codex/auth/login', { method: 'POST' })
    expect(response.status).toBe(200)
    expect(availability).not.toHaveBeenCalled()
  } finally {
    availability.mockRestore()
  }
})

test('one response includes missing installations and signed-out accounts', async () => {
  claudeRuntime.mockResolvedValue({
    status: 'unavailable',
    code: 'not-installed',
    reason: 'Claude is not installed'
  })
  const response = await api.request('/api/harnesses/status?refresh=true')
  const statuses = await response.json()
  expect(Object.keys(statuses).sort()).toEqual(['claude-code', 'codex', 'hermes', 'openclaw'])
  expect(statuses['claude-code'].availability.code).toBe('not-installed')
  expect(statuses.codex.availability.status).toBe('login-required')
  expect(claudeAuth).not.toHaveBeenCalled()
})

test('normal status reads reuse cached availability; explicit retries bypass it', async () => {
  let probes = 0
  codexHarness.authStatus = async () => {
    probes++
    return { status: 'available' }
  }
  await api.request('/api/harnesses/status')
  await api.request('/api/harnesses/status')
  expect(probes).toBe(1)
  codexHarness.authStatus = async () => {
    probes++
    return { status: 'login-required', reason: 'Signed out externally' }
  }
  const cached = await api.request('/api/harnesses/status')
  expect((await cached.json()).codex.availability.status).toBe('available')
  const fresh = await api.request('/api/harnesses/status?refresh=true')
  expect((await fresh.json()).codex.availability.status).toBe('login-required')
  expect(probes).toBe(2)
  await api.request('/api/harnesses/status')
  expect(probes).toBe(2)
})
