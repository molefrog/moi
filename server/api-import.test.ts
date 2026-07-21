import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { WorkspaceEntry } from '@/lib/types'

import { api } from './api'
import { claudeCodeHarness } from './harness/claude-code'
import { codexHarness } from './harness/codex'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'

let tempDir: string
const originalClaudeAvailability = claudeCodeHarness.availability
const originalCodexAvailability = codexHarness.availability

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-api-import-'))
  setRegistryPath(join(tempDir, 'workspaces.json'))
  claudeCodeHarness.availability = async () => ({ available: true })
  codexHarness.availability = async () => ({ available: true })
})

afterEach(async () => {
  claudeCodeHarness.availability = originalClaudeAvailability
  codexHarness.availability = originalCodexAvailability
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(tempDir, { recursive: true, force: true })
})

describe('workspace import provider', () => {
  test('defaults a missing provider type to Claude Code', async () => {
    const workspacePath = join(tempDir, 'workspace')
    await mkdir(join(workspacePath, '.moi'), { recursive: true })
    await Bun.write(join(workspacePath, '.moi', 'package.json'), '{}\n')

    const response = await api.request('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: workspacePath })
    })

    expect(response.status).toBe(201)
    const workspace = (await response.json()) as WorkspaceEntry
    expect(workspace.type).toBe('claude-code')
    expect(
      await Bun.file(join(workspacePath, '.claude', 'skills', 'moi-workspace', 'SKILL.md')).exists()
    ).toBe(true)
  })

  test('rejects an unknown provider type', async () => {
    const response = await api.request('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: join(tempDir, 'workspace'), type: 'unknown-provider' })
    })

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('Unknown workspace type')
  })

  test.each([
    {
      type: 'claude-code' as const,
      harness: claudeCodeHarness,
      reason: 'Run curl -fsSL https://claude.ai/install.sh | sh in your terminal to install Claude'
    },
    {
      type: 'codex' as const,
      harness: codexHarness,
      reason:
        'Run curl -fsSL https://chatgpt.com/codex/install.sh | sh in your terminal to install Codex'
    }
  ])('rejects unavailable $type before provisioning', async ({ type, harness, reason }) => {
    harness.availability = async () => ({ available: false, reason })
    const workspacePath = join(tempDir, type)

    const response = await api.request('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: workspacePath, type })
    })

    expect(response.status).toBe(400)
    expect(await response.text()).toBe(reason)
    expect(await Bun.file(join(workspacePath, '.moi', 'package.json')).exists()).toBe(false)
  })

  test.each([
    {
      type: 'claude-code' as const,
      harness: claudeCodeHarness,
      reason: 'Run curl -fsSL https://claude.ai/install.sh | sh in your terminal to install Claude'
    },
    {
      type: 'codex' as const,
      harness: codexHarness,
      reason:
        'Run curl -fsSL https://chatgpt.com/codex/install.sh | sh in your terminal to install Codex'
    }
  ])('reports unavailable $type for a registered workspace', async ({ type, harness, reason }) => {
    harness.availability = async () => ({ available: false, reason })
    const entry = await registerWorkspace(join(tempDir, type), { type })

    const response = await api.request(`/api/workspaces/${entry.id}/availability`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ available: false, reason })
  })
})
