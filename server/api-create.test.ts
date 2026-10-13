import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'

import { api } from './api'
import { claudeCodeHarness } from './harness/claude-code'
import { codexHarness } from './harness/codex'
import * as executables from './harness/executable'
import type { HarnessInstallations } from '@/lib/types'

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

test('setup info reports Claude and Codex availability from their harnesses', async () => {
  claudeCodeHarness.availability = async () => ({
    status: 'unavailable',
    reason: 'Install Claude'
  })
  codexHarness.availability = async () => ({
    status: 'unavailable',
    reason: 'Install Codex'
  })

  const response = await api.request('/api/workspaces/create')
  const body = (await response.json()) as {
    availability: Record<string, { status: string; reason?: string }>
    installed: HarnessInstallations
  }

  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(body.installed).toEqual({
    'claude-code': true,
    codex: true,
    openclaw: false,
    hermes: false
  })
  expect(body.availability['claude-code']).toEqual({
    status: 'unavailable',
    reason: 'Install Claude'
  })
  expect(body.availability.codex).toEqual({
    status: 'unavailable',
    reason: 'Install Codex'
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
