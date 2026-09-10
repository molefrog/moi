import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { api } from './api'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'

let root: string
let workspaceId: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'moi-api-tools-'))
  setRegistryPath(join(root, 'workspaces.json'))
  workspaceId = (await registerWorkspace(root, { type: 'claude-code' })).id
})

afterEach(async () => {
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(root, { recursive: true, force: true })
})

test('serves the Scratchpad catalog and calls through the canonical target route', async () => {
  const base = `/api/workspaces/${workspaceId}/tools/scratchpad`
  const catalog = await api.request(base)
  expect(catalog.status).toBe(200)
  expect((await catalog.json()).map((tool: { name: string }) => tool.name)).toEqual([
    'read_canvas',
    'read_image',
    'render_canvas',
    'add_text',
    'add_rectangle',
    'add_note',
    'add_arrow',
    'add_image',
    'move_shape',
    'set_shape_text',
    'delete_shape',
    'clear_canvas'
  ])

  const add = await api.request(`${base}/add_note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'note', x: 10, y: 20, text: 'Hello' })
  })
  expect(add.status).toBe(200)
  expect(await add.json()).toEqual({ id: 'note' })

  const read = await api.request(`${base}/read_canvas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })
  expect(read.status).toBe(200)
  expect(await read.json()).toEqual({
    shapes: [expect.objectContaining({ id: 'note', x: 10, y: 20, text: 'Hello' })]
  })
})
