import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test'
import { parse, stringify } from 'devalue'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { api } from './index'
import { APPLET_API_BASE_SENTINEL } from '../applets/api-base'
import { restartWorker } from '../applets/functions'
import { toolProxy } from '../applets/runtime/rpc'
import { DEFAULT_REGISTRY_PATH, setRegistryPath } from '../workspaces/registry'

let root: string
const previousFunctionsDir = process.env.MEI_FUNCTIONS_DIR
const base = '/api/workspaces/tools-api'

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'moi-tools-api-'))
  process.env.MEI_FUNCTIONS_DIR = join(root, '.moi')
  setRegistryPath(join(root, 'registry.json'))
  await Bun.write(
    join(root, 'registry.json'),
    JSON.stringify([{ id: 'tools-api', path: root, type: 'claude-code' }])
  )
  await Bun.write(
    join(root, '.moi/views/tool-demo.server.ts'),
    await Bun.file(join(import.meta.dir, '../test/__fixtures__/views/tool-demo.server.ts')).text()
  )
})
afterAll(async () => {
  restartWorker(root)
  if (previousFunctionsDir === undefined) delete process.env.MEI_FUNCTIONS_DIR
  else process.env.MEI_FUNCTIONS_DIR = previousFunctionsDir
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(root, { recursive: true, force: true })
})

test('workspace routes discover and invoke tools without exposing legacy functions', async () => {
  const response = await api.request(`${base}/tools/view%3Atool-demo`)
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  const catalog = await response.json()
  expect(catalog).toContainEqual({
    name: 'read_saved',
    description: 'Read saved count',
    inputSchema: { type: 'object' },
    annotations: { readOnlyHint: true }
  })
  expect(JSON.stringify(catalog)).not.toContain('saveOrder')
  const call = await api.request(`${base}/tools/view%3Atool-demo/save_order`, {
    method: 'POST',
    body: JSON.stringify({ id: 'a' })
  })
  expect(call.status).toBe(200)
  expect(await call.json()).toMatchObject({ id: 'a', saved: 1 })
  const legacy = await api.request(`${base}/rpc/views/tool-demo/getSaved`, {
    method: 'POST',
    body: stringify([])
  })
  expect(parse(await legacy.text())).toBe(1)
})

test('unknown workspaces, malformed JSON, schemas and unknown tools fail', async () => {
  expect((await api.request('/api/workspaces/missing/tools/view%3Atool-demo')).status).toBe(404)
  expect(
    (await api.request(`${base}/tools/view%3Atool-demo/save_order`, { method: 'POST', body: '{' }))
      .status
  ).toBe(400)
  for (const [name, args, message] of [
    ['save_order', {}, 'Invalid tool arguments'],
    ['saveOrder', {}, 'Unknown server tool'],
    ['save_order', [], 'JSON object']
  ] as const) {
    const response = await api.request(`${base}/tools/view%3Atool-demo/${name}`, {
      method: 'POST',
      body: JSON.stringify(args)
    })
    expect(response.ok).toBe(false)
    expect(await response.text()).toContain(message)
  }
})

test('the browser proxy calls the real API and forwards validation failures', async () => {
  const mock = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        api.request(String(input).replace(APPLET_API_BASE_SENTINEL, base), init),
      { preconnect: fetch.preconnect }
    )
  )
  try {
    const tools = toolProxy('tool-demo')
    expect(await tools.save_order.execute({ id: 'browser' })).toMatchObject({ id: 'browser' })
    expect(await tools.read_saved.execute()).toHaveProperty('saved')
    await expect(tools.save_order.execute({})).rejects.toThrow('Invalid tool arguments')
  } finally {
    mock.mockRestore()
  }
})
