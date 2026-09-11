import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { api } from './api'
import { codexHarness } from './harness/codex'
import { DEFAULT_REGISTRY_PATH, getWorkspace, registerWorkspace, setRegistryPath } from './registry'

const originalStopWorkspace = codexHarness.stopWorkspace
let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-api-remove-'))
  setRegistryPath(join(tempDir, 'workspaces.json'))
})

afterEach(async () => {
  codexHarness.stopWorkspace = originalStopWorkspace
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(tempDir, { recursive: true, force: true })
})

test('removing a workspace stops its harness', async () => {
  const workspacePath = join(tempDir, 'workspace')
  const workspace = await registerWorkspace(workspacePath, { type: 'codex' })
  const stopped: string[] = []
  codexHarness.stopWorkspace = path => stopped.push(path)

  const response = await api.request(`/api/workspaces/${workspace.id}`, { method: 'DELETE' })

  expect(response.status).toBe(204)
  expect(stopped).toEqual([workspacePath])
  expect(await getWorkspace(workspace.id)).toBeNull()
})
