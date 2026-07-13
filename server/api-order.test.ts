import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { WorkspaceEntry } from '@/lib/types'

import { api } from './api'
import { setEventServer } from './events'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'

let tempDir: string
let published: string[]

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-api-order-'))
  setRegistryPath(join(tempDir, 'workspaces.json'))
  published = []
  setEventServer({
    publish: (_topic, data) => {
      published.push(data)
    }
  })
})

afterEach(async () => {
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(tempDir, { recursive: true, force: true })
})

test('reordering workspaces broadcasts a workspace update', async () => {
  const first = await registerWorkspace(join(tempDir, 'first'))
  const second = await registerWorkspace(join(tempDir, 'second'))

  const response = await api.request('/api/workspaces/order', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [second.id, first.id] })
  })

  expect(response.status).toBe(200)
  expect((await response.json()).map((entry: WorkspaceEntry) => entry.id)).toEqual([
    second.id,
    first.id
  ])
  expect(published).toEqual([JSON.stringify({ type: 'workspace:updated' })])
})

test('native folder picker rejects cross-origin requests before spawning OS UI', async () => {
  const response = await api.request('/api/workspaces/choose-folder', {
    method: 'POST',
    headers: {
      Origin: 'https://example.test'
    }
  })

  expect(response.status).toBe(403)
  expect(await response.text()).toBe('Forbidden')
})
