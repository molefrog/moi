import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { api } from './api'
import { claudeCodeHarness } from './harness/claude-code'
import { codexHarness } from './harness/codex'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'

let tempDir: string
const originalClaudeAvailability = claudeCodeHarness.availability
const originalClaudeReadiness = claudeCodeHarness.readiness
const originalClaudeStartLogin = claudeCodeHarness.startLogin
const originalCodexAvailability = codexHarness.availability
const originalCodexReadiness = codexHarness.readiness
const originalCodexStartLogin = codexHarness.startLogin

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-api-auth-'))
  setRegistryPath(join(tempDir, 'workspaces.json'))
  claudeCodeHarness.availability = async () => ({ available: true })
  claudeCodeHarness.readiness = async () => ({ available: true })
  claudeCodeHarness.startLogin = undefined
  codexHarness.availability = async () => ({ available: true })
  codexHarness.readiness = async () => ({ available: true })
  codexHarness.startLogin = async () => ({ type: 'browser', url: 'https://example.com/login' })
})

afterEach(async () => {
  claudeCodeHarness.availability = originalClaudeAvailability
  claudeCodeHarness.readiness = originalClaudeReadiness
  claudeCodeHarness.startLogin = originalClaudeStartLogin
  codexHarness.availability = originalCodexAvailability
  codexHarness.readiness = originalCodexReadiness
  codexHarness.startLogin = originalCodexStartLogin
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(tempDir, { recursive: true, force: true })
})

describe('workspace agent authentication', () => {
  test('availability includes workspace-level sign-in state', async () => {
    codexHarness.readiness = async () => ({
      available: false,
      reason: 'Codex is signed out. Sign in to send messages',
      recovery: { kind: 'login', command: 'codex login', inApp: true }
    })
    const workspace = await registerWorkspace(join(tempDir, 'codex'), { type: 'codex' })

    const response = await api.request(`/api/workspaces/${workspace.id}/availability`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      available: false,
      reason: 'Codex is signed out. Sign in to send messages',
      recovery: { kind: 'login', command: 'codex login', inApp: true }
    })
  })

  test('starts a provider-owned browser login flow', async () => {
    const workspace = await registerWorkspace(join(tempDir, 'codex'), { type: 'codex' })

    const response = await api.request(`/api/workspaces/${workspace.id}/auth/login`, {
      method: 'POST'
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      type: 'browser',
      url: 'https://example.com/login'
    })
  })

  test('keeps terminal-only login providers explicit', async () => {
    const workspace = await registerWorkspace(join(tempDir, 'claude'), { type: 'claude-code' })

    const response = await api.request(`/api/workspaces/${workspace.id}/auth/login`, {
      method: 'POST'
    })

    expect(response.status).toBe(409)
    expect(await response.text()).toBe('This agent requires terminal sign-in')
  })
})
