import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import * as appConfig from '../app-config'
import * as init from '../workspaces/init'
import { DEFAULT_REGISTRY_PATH, setRegistryPath } from '../workspaces/registry'
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'

import { api } from './index'
import { claudeCodeHarness } from '../harness/claude-code'
import { codexHarness } from '../harness/codex'
import * as executables from '../harness/executable'

const originalClaudeAvailability = claudeCodeHarness.availability
const originalCodexAvailability = codexHarness.availability
let installationSpy: ReturnType<typeof spyOn<typeof executables, 'detectInstalledHarnesses'>>

beforeEach(() => {
  installationSpy = spyOn(executables, 'detectInstalledHarnesses').mockResolvedValue({
    'claude-code': true,
    codex: true,
    openclaw: false,
    hermes: false
  })
  claudeCodeHarness.availability = async () => ({ status: 'available' })
  codexHarness.availability = async () => ({ status: 'available' })
})

afterEach(() => {
  installationSpy.mockRestore()
  claudeCodeHarness.availability = originalClaudeAvailability
  codexHarness.availability = originalCodexAvailability
})

function createWorkspace(type: unknown) {
  return api.request('/api/workspaces/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'test-workspace', type })
  })
}

test('creating a workspace defaults a missing provider type to Claude Code', async () => {
  const response = await api.request('/api/workspaces/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '' })
  })

  expect(response.status).toBe(400)
  expect(await response.text()).toBe('Folder name is required')
})

test('creating a workspace rejects an unknown provider type', async () => {
  const response = await createWorkspace('unknown-provider')

  expect(response.status).toBe(400)
  expect(await response.text()).toBe('Unknown workspace type')
})

test('creating a workspace rejects a provider that only supports discovery', async () => {
  const response = await createWorkspace('openclaw')

  expect(response.status).toBe(400)
  expect(await response.text()).toBe(
    'Workspaces of this type arrive through discovery, not creation'
  )
})

test('setup info returns only installation facts without checking runtime availability', async () => {
  claudeCodeHarness.availability = async () => {
    throw new Error('Must not probe availability')
  }
  codexHarness.availability = async () => {
    throw new Error('Must not probe availability')
  }

  const response = await api.request('/api/workspaces/create')
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toEqual({
    installed: { 'claude-code': true, codex: true, openclaw: false, hermes: false }
  })
})

test('rechecks installations on every setup request', async () => {
  installationSpy
    .mockResolvedValueOnce({
      'claude-code': false,
      codex: false,
      openclaw: false,
      hermes: false
    })
    .mockResolvedValueOnce({
      'claude-code': false,
      codex: true,
      openclaw: true,
      hermes: false
    })
  const first = await api.request('/api/workspaces/create')
  const second = await api.request('/api/workspaces/create')
  expect((await first.json()).installed.codex).toBe(false)
  expect((await second.json()).installed).toEqual({
    'claude-code': false,
    codex: true,
    openclaw: true,
    hermes: false
  })
  expect(installationSpy).toHaveBeenCalledTimes(2)
})

test('reports failed detection as an error', async () => {
  installationSpy.mockRejectedValue(new Error('Detection failed'))
  const logSpy = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const response = await api.request('/api/workspaces/create')
    expect(response.status).toBe(500)
  } finally {
    logSpy.mockRestore()
  }
})

test('rejects creation if the executable disappeared after setup', async () => {
  await api.request('/api/workspaces/create')
  codexHarness.availability = async () => ({ status: 'unavailable', reason: 'Install Codex' })
  const response = await createWorkspace('codex')
  expect(response.status).toBe(400)
  expect(await response.text()).toBe('Install Codex')
})

test('creation checks installation without requiring login', async () => {
  const authSpy = spyOn(codexHarness, 'authStatus').mockResolvedValue({
    status: 'login-required',
    reason: 'Signed out'
  })
  try {
    const response = await api.request('/api/workspaces/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', type: 'codex' })
    })
    expect(response.status).toBe(400)
    expect(await response.text()).toBe('Folder name is required')
    expect(authSpy).not.toHaveBeenCalled()
  } finally {
    authSpy.mockRestore()
  }
})

test('unnamed workspaces get an available default name and the selected agent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moi-empty-workspace-'))
  setRegistryPath(join(directory, 'registry.json'))
  const root = spyOn(appConfig, 'createdWorkspacesRoot').mockReturnValue(directory)
  const provision = spyOn(init, 'provisionWorkspace').mockImplementation(async path => {
    await mkdir(path, { recursive: true })
    return { skillsDir: path, scaffold: 'exists', installLogPath: join(path, 'install.log') }
  })
  try {
    for (const [type, name] of [
      ['codex', 'My workspace'],
      ['claude-code', 'My workspace 2']
    ]) {
      const response = await api.request('/api/workspaces/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      })
      expect(response.status).toBe(201)
      const workspace = await response.json()
      expect(basename(workspace.path)).toBe(name)
      expect(workspace.type).toBe(type)
      expect(provision).toHaveBeenCalledWith(join(directory, name!), type)
    }
  } finally {
    provision.mockRestore()
    root.mockRestore()
    setRegistryPath(DEFAULT_REGISTRY_PATH)
    await rm(directory, { recursive: true, force: true })
  }
})
