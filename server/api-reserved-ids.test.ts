// Guards `RESERVED_WORKSPACE_IDS` against route drift: a workspace id that
// collides with a literal route under `/api/workspaces/` is persisted fine and
// then unreachable, so the reserved list must keep covering every such route.
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { RESERVED_WORKSPACE_IDS } from '@/lib/ids'

import { api } from './api'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'

// Literal (non-parameter) first segments registered under `/api/workspaces/` —
// exactly the paths that would shadow `/:id`.
function staticCollectionRoutes(): string[] {
  const segments = new Set<string>()
  for (const route of api.routes) {
    const match = /^\/api\/workspaces\/([^/:*]+)(?:$|\/)/.exec(route.path)
    if (match) segments.add(match[1]!)
  }
  return [...segments].sort()
}

test('every literal route under /api/workspaces is a reserved id', () => {
  for (const segment of staticCollectionRoutes()) {
    expect(RESERVED_WORKSPACE_IDS).toContain(segment)
  }
})

test('the WebSocket path stays reserved', () => {
  // `/api/workspaces/ws` is served from Bun's routes table in `web.ts`, not the
  // Hono router above, so it can never be re-derived — it is pinned here.
  expect(RESERVED_WORKSPACE_IDS).toContain('ws')
})

test('a reserved id is refused before it can shadow its route', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'moi-reserved-ids-'))
  setRegistryPath(join(tempDir, 'workspaces.json'))
  try {
    for (const id of RESERVED_WORKSPACE_IDS) {
      await expect(registerWorkspace(join(tempDir, id), { id })).rejects.toThrow('is reserved')
    }
    // Without the check, this request would return the static route's payload
    // instead of the workspace — the failure mode the reservation prevents.
    const response = await api.request('/api/workspaces/create')
    expect(await response.json()).not.toHaveProperty('id', 'create')
  } finally {
    setRegistryPath(DEFAULT_REGISTRY_PATH)
    await rm(tempDir, { recursive: true, force: true })
  }
})
