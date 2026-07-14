import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { WorkspaceEntry } from '@/lib/types'

import { api, isSameOriginRequest } from './api'
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
  expect(published).toEqual([JSON.stringify({ type: 'workspaces-list:updated' })])
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

test('same-origin detection survives TLS-terminating proxies', () => {
  // Modern browser behind Cloudflare Tunnel / nginx / ngrok: Origin is https://
  // while the server's own URL is plain http — sec-fetch-site decides.
  expect(
    isSameOriginRequest(
      new Request('http://moi.example.com/api/workspaces/choose-folder', {
        method: 'POST',
        headers: { Origin: 'https://moi.example.com', 'sec-fetch-site': 'same-origin' }
      })
    )
  ).toBe(true)

  // Older browser, no sec-fetch-site: hosts match even though schemes differ.
  expect(
    isSameOriginRequest(
      new Request('http://moi.example.com/api/workspaces/choose-folder', {
        method: 'POST',
        headers: { Origin: 'https://moi.example.com' }
      })
    )
  ).toBe(true)

  // Cross-site stays rejected, with or without sec-fetch-site.
  expect(
    isSameOriginRequest(
      new Request('http://localhost:13337/api/workspaces/choose-folder', {
        method: 'POST',
        headers: { Origin: 'https://evil.test', 'sec-fetch-site': 'cross-site' }
      })
    )
  ).toBe(false)
  expect(
    isSameOriginRequest(
      new Request('http://localhost:13337/api/workspaces/choose-folder', {
        method: 'POST',
        headers: { Origin: 'https://evil.test' }
      })
    )
  ).toBe(false)
})
