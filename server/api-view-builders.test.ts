import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ViewBuilder } from '@/lib/types'

import { api } from './api'
import { DATA_DIR } from './data-dir'
import { codexHarness } from './harness/codex'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'
import { setViewBuilderStorePath } from './view-builders'

let tempDir: string
const originalCodexAvailability = codexHarness.availability

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-api-view-builders-'))
  setRegistryPath(join(tempDir, 'workspaces.json'))
  setViewBuilderStorePath(join(tempDir, 'view-builders.json'))
  codexHarness.availability = async () => ({ available: true })
})

afterEach(async () => {
  codexHarness.availability = originalCodexAvailability
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  setViewBuilderStorePath(join(DATA_DIR, 'view-builders.json'))
  await rm(tempDir, { recursive: true, force: true })
})

describe('view builder availability', () => {
  test('rejects submission before changing a builder to building', async () => {
    const workspace = await registerWorkspace(join(tempDir, 'workspace'), { type: 'codex' })
    const createResponse = await api.request(`/api/workspaces/${workspace.id}/view-builders`, {
      method: 'POST'
    })
    const draft = (await createResponse.json()) as ViewBuilder
    const reason =
      'Run curl -fsSL https://chatgpt.com/codex/install.sh | sh in your terminal to install Codex'
    codexHarness.availability = async () => ({ available: false, reason })

    const response = await api.request(
      `/api/workspaces/${workspace.id}/view-builders/${draft.id}/submit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { requirements: 'Build a customer dashboard' },
          availableIcons: ['chart']
        })
      }
    )

    expect(response.status).toBe(400)
    expect(await response.text()).toBe(reason)

    const listResponse = await api.request(`/api/workspaces/${workspace.id}/view-builders`)
    const { builders } = (await listResponse.json()) as { builders: ViewBuilder[] }
    expect(builders).toHaveLength(1)
    expect(builders[0].status).toBe('draft')
  })
})
