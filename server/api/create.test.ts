import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import * as appConfig from '../app-config'
import * as init from '../workspaces/init'
import { getWorkspaceConfig } from '../workspaces/config'
import { DEFAULT_REGISTRY_PATH, setRegistryPath } from '../workspaces/registry'
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'

import { api } from './index'
import { claudeCodeHarness } from '../harness/claude-code'
import { codexHarness } from '../harness/codex'

const originalClaudeAvailability = claudeCodeHarness.availability
const originalCodexAvailability = codexHarness.availability

beforeEach(() => {
  claudeCodeHarness.availability = async () => ({ status: 'available' })
  codexHarness.availability = async () => ({ status: 'available' })
})

afterEach(() => {
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
  expect(await response.text()).toBe('Workspace name is required')
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

test('rejects creation if the executable disappeared after setup', async () => {
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
    expect(await response.text()).toBe('Workspace name is required')
    expect(authSpy).not.toHaveBeenCalled()
  } finally {
    authSpy.mockRestore()
  }
})

test('creation uses a unique slug for the ID and folder while preserving the display name', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moi-empty-workspace-'))
  setRegistryPath(join(directory, 'registry.json'))
  const root = spyOn(appConfig, 'createdWorkspacesRoot').mockReturnValue(directory)
  const provision = spyOn(init, 'provisionWorkspace').mockImplementation(async path => {
    await mkdir(path, { recursive: true })
    return { skillsDir: path, scaffold: 'exists' }
  })
  try {
    for (const [type, name, displayName] of [
      ['codex', 'my-workspace', undefined],
      ['claude-code', 'my-workspace-2', undefined],
      ['codex', 'cafe-research', 'Café / Research'],
      ['codex', 'cafe-research-2', 'Café / Research'],
      ['codex', 'create-2', 'Create']
    ] as const) {
      const response = await api.request('/api/workspaces/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name: displayName })
      })
      expect(response.status).toBe(201)
      const workspace = await response.json()
      expect(basename(workspace.path)).toBe(name)
      expect(workspace.id).toBe(name)
      expect(workspace.name).toBe(displayName ?? 'My workspace')
      expect((await getWorkspaceConfig(workspace.path)).name).toBe(displayName ?? 'My workspace')
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
