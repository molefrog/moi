import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { WorkspaceEntry } from '@/lib/types'

import { api } from './api'
import { DEFAULT_REGISTRY_PATH, setRegistryPath } from './registry'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-api-import-'))
  setRegistryPath(join(tempDir, 'workspaces.json'))
})

afterEach(async () => {
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
})
