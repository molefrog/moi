import { afterEach, beforeEach, expect, test } from 'bun:test'

import { api } from './api'
import { claudeCodeHarness } from './harness/claude-code'
import { codexHarness } from './harness/codex'

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
  }

  expect(response.status).toBe(200)
  expect(body.availability['claude-code']).toEqual({
    status: 'unavailable',
    reason: 'Install Claude'
  })
  expect(body.availability.codex).toEqual({
    status: 'unavailable',
    reason: 'Install Codex'
  })
})
