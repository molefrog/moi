// Cloud demo protections on the API: both workspace-creation routes refuse
// with 403, and GET /api/config exposes the flag to the client. The demo flag
// comes from the startup config, toggled here via MOI_CLOUD_DEMO + the
// resetAppConfig test seam.
import { afterEach, beforeEach, expect, test } from 'bun:test'

import { api } from './api'
import { resetAppConfig } from './app-config'
import { claudeCodeHarness } from './harness/claude-code'

const originalClaudeAvailability = claudeCodeHarness.availability

// All three env vars pinned so a real config.json on the machine running the
// tests (env wins over file) can never change the assertions. Availability is
// mocked because with the gate off the create route checks the harness before
// validating the name — on a runner without the Claude CLI that 400s first.
beforeEach(() => {
  process.env.MOI_CLOUD_DEMO = '1'
  process.env.MOI_EXPERIMENTS = ''
  process.env.MOI_DEMO_INSTALL_URL = 'https://moi.computer'
  resetAppConfig()
  claudeCodeHarness.availability = async () => ({ status: 'available' })
})

afterEach(() => {
  delete process.env.MOI_CLOUD_DEMO
  delete process.env.MOI_EXPERIMENTS
  delete process.env.MOI_DEMO_INSTALL_URL
  resetAppConfig()
  claudeCodeHarness.availability = originalClaudeAvailability
})

test('cloud demo blocks creating a workspace', async () => {
  const response = await api.request('/api/workspaces/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'my-workspace', type: 'claude-code' })
  })

  expect(response.status).toBe(403)
  expect(await response.text()).toBe('Workspace creation is not available in the moi demo')
})

test('cloud demo blocks adding an existing folder', async () => {
  const response = await api.request('/api/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: '/tmp/some-folder', type: 'claude-code' })
  })

  expect(response.status).toBe(403)
  expect(await response.text()).toBe('Workspace creation is not available in the moi demo')
})

test('GET /api/config reports the demo flag and install url', async () => {
  const response = await api.request('/api/config')
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(body).toEqual({
    cloudDemo: true,
    experiments: [],
    demoInstallUrl: 'https://moi.computer'
  })
})

test('without the demo flag, creation is not blocked by the gate', async () => {
  delete process.env.MOI_CLOUD_DEMO
  resetAppConfig()

  const response = await api.request('/api/workspaces/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '' })
  })

  // Falls through to ordinary validation instead of the demo 403.
  expect(response.status).toBe(400)
  expect(await response.text()).toBe('Folder name is required')
})
