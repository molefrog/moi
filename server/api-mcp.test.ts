import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { api } from './api'
import { claudeCodeHarness } from './harness/claude-code'
import { codexHarness } from './harness/codex'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'

let tempDir: string
const originalClaudeMcpStatus = claudeCodeHarness.mcpStatus
const originalCodexMcpStatus = codexHarness.mcpStatus

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-api-mcp-'))
  setRegistryPath(join(tempDir, 'workspaces.json'))
})

afterEach(async () => {
  claudeCodeHarness.mcpStatus = originalClaudeMcpStatus
  codexHarness.mcpStatus = originalCodexMcpStatus
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(tempDir, { recursive: true, force: true })
})

test('workspace connector status dispatches through the selected harness', async () => {
  claudeCodeHarness.mcpStatus = async () => [{ name: 'claude-only', status: 'connected' }]
  codexHarness.mcpStatus = async () => [{ name: 'codex-only', status: 'needs-auth' }]

  const claude = await registerWorkspace(join(tempDir, 'claude'), { type: 'claude-code' })
  const codex = await registerWorkspace(join(tempDir, 'codex'), { type: 'codex' })

  const claudeResponse = await api.request(`/api/workspaces/${claude.id}/mcp`)
  const codexResponse = await api.request(`/api/workspaces/${codex.id}/mcp`)

  expect(claudeResponse.status).toBe(200)
  expect(await claudeResponse.json()).toEqual([{ name: 'claude-only', status: 'connected' }])
  expect(codexResponse.status).toBe(200)
  expect(await codexResponse.json()).toEqual([{ name: 'codex-only', status: 'needs-auth' }])
})

test('workspace connector status is empty for a harness without MCP support', async () => {
  const openclaw = await registerWorkspace(join(tempDir, 'openclaw'), { type: 'openclaw' })

  const response = await api.request(`/api/workspaces/${openclaw.id}/mcp`)

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual([])
})

test('the removed global connector endpoint is not available', async () => {
  const response = await api.request('/api/mcp')

  expect(response.status).toBe(404)
})
