import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test'
import { parse, stringify } from 'devalue'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { api } from '../api'
import { APPLET_API_BASE_SENTINEL, RPC_MODULE_SOURCE } from '../bundler/build-applet'
import { restartWorker } from '../functions'
import { DEFAULT_REGISTRY_PATH, setRegistryPath } from '../registry'
import { callTool } from '../tools'
import {
  resetWorkspaceEnvForTest,
  setSecretStoreBackend,
  setWorkspaceEnvStorePath
} from '../workspace-env'

let root: string
const previousFunctionsDir = process.env.MEI_FUNCTIONS_DIR
const base = 'http://moi.test/api/workspaces/compat'
type BrowserTools = Record<
  string,
  { execute(args: unknown, options?: { signal: AbortSignal }): Promise<unknown> }
>
let browserTools: BrowserTools

const apiFetch = Object.assign(
  async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    api.request(input instanceof Request ? input : String(input), init),
  { preconnect: fetch.preconnect }
)

beforeAll(async () => {
  // Stay inside the repo so the emitted transport can resolve devalue.
  root = await mkdtemp(join(import.meta.dir, 'tool-compat-'))
  process.env.MEI_FUNCTIONS_DIR = join(root, '.moi')
  setRegistryPath(join(root, 'registry.json'))
  setWorkspaceEnvStorePath(join(root, 'env.json'), join(root, 'secrets.json'))
  setSecretStoreBackend('file')
  await Bun.write(
    join(root, 'registry.json'),
    JSON.stringify([{ id: 'compat', path: root, type: 'claude-code' }])
  )
  await Bun.write(
    join(root, '.moi/views/orders.server.ts'),
    `
    let count = 0
    async function save(id, date, tags) {
      return { id, date, tags, count: ++count }
    }
    // Retained for existing bundles: positional arguments and rich results.
    export async function saveOrder(id, date, tags) { return save(id, date, tags) }
    export const tools = {
      save_order: {
        description: 'Save an order',
        inputSchema: {
          type: 'object', properties: {
            id: { type: 'string' }, date: { type: 'string', format: 'date-time' },
            tags: { type: 'array', items: { type: 'string' } }
          }, required: ['id', 'date', 'tags'], additionalProperties: false
        },
        execute: async ({ id, date, tags }) => {
          const value = await save(id, new Date(date), new Map(tags.map(tag => [tag, true])))
          return { ...value, date: value.date.toISOString(), tags: [...value.tags.keys()] }
        }
      }
    }
  `
  )
  const runtime = join(root, 'transport.mjs')
  await Bun.write(runtime, RPC_MODULE_SOURCE.replaceAll(APPLET_API_BASE_SENTINEL, base))
  const transport: { toolProxy(viewId: string): BrowserTools } = await import(runtime)
  browserTools = transport.toolProxy('orders')
})

afterAll(async () => {
  restartWorker(root)
  if (previousFunctionsDir === undefined) delete process.env.MEI_FUNCTIONS_DIR
  else process.env.MEI_FUNCTIONS_DIR = previousFunctionsDir
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  resetWorkspaceEnvForTest()
  await rm(root, { recursive: true, force: true })
})

test('old bundle RPC, browser tools and CLI tools share the migrated backend', async () => {
  const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(apiFetch)
  try {
    // Frozen old bundle wire format: independent of the current proxy generator.
    const date = new Date('2026-01-02T00:00:00.000Z')
    const tags = new Map([['urgent', true]])
    const oldCall = async () => {
      const response = await fetch(`${base}/rpc/views/orders/saveOrder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: stringify(['a', date, tags])
      })
      expect(response.status).toBe(200)
      return parse(await response.text())
    }
    expect(await oldCall()).toEqual({ id: 'a', date, tags, count: 1 })
    const args = { id: 'a', date: date.toISOString(), tags: ['urgent'] }
    expect(await browserTools.save_order.execute(args)).toEqual({ ...args, count: 2 })
    expect(await callTool({ id: 'compat', path: root }, 'view:orders/save_order', args)).toEqual({
      ...args,
      count: 3
    })
    expect(await oldCall()).toEqual({ id: 'a', date, tags, count: 4 })
    const catalog = await callTool({ id: 'compat', path: root }, 'view:orders')
    expect(JSON.stringify(catalog)).toContain('save_order')
    expect(JSON.stringify(catalog)).not.toContain('saveOrder')
  } finally {
    fetchMock.mockRestore()
  }
})

test('browser tool proxies surface validation and unknown-tool errors from the real route', async () => {
  const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(apiFetch)
  try {
    await expect(browserTools.save_order.execute({ id: 'a' })).rejects.toThrow(
      'Invalid tool arguments'
    )
    await expect(browserTools.saveOrder.execute({})).rejects.toThrow('Unknown server tool')
  } finally {
    fetchMock.mockRestore()
  }
})
