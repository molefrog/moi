import { afterAll, expect, test } from 'bun:test'
import { join } from 'path'
import { parse, stringify } from 'devalue'
import { callFunction, restartWorker } from './functions'
import { callTool, callServerTool, listServerTools, listTools } from './tools'
import { viewToolRelay } from './view-tool-relay'

const fixture = join(import.meta.dir, 'test', '__fixtures__')
process.env.MEI_FUNCTIONS_DIR = fixture
const workspace = { id: 'tool-tests', path: fixture }
afterAll(() => restartWorker(fixture))

test('legacy functions named tools stay callable without becoming a catalog', async () => {
  expect(await listServerTools(fixture, 'legacy-tools')).toEqual([])
  expect(
    parse(await callFunction('views/legacy-tools', 'tools', stringify(['a']), fixture))
  ).toEqual({
    id: 'a',
    updated: new Date('2026-01-01T00:00:00Z')
  })
})

test('discovers explicit server tools without a browser and strips handlers', async () => {
  const result = await listTools(workspace, 'view:tool-demo')
  expect(result).toMatchObject({ target: 'view:tool-demo', ui: 'unavailable' })
  const text = JSON.stringify(result)
  expect(text).toContain('"name":"save_order"')
  expect(text).not.toContain('"address"')
  expect(text).toContain('"runtime":"server"')
  expect(text).not.toContain('execute')
  expect(text).not.toContain('server-only-tool-implementation')
  expect(text).not.toContain('saveOrder')
  expect(await listServerTools(fixture, 'missing')).toEqual([])
})

test('CLI and browser server calls share validation, handler and warm worker state', async () => {
  const before = parse(
    await callFunction('views/tool-demo', 'getSaved', stringify([]), fixture)
  ) as number
  await expect(callTool(workspace, 'view:tool-demo', 'save_order', {})).rejects.toThrow(
    'Invalid tool arguments'
  )
  await expect(
    callServerTool(fixture, 'tool-demo', 'save_order', { id: 'a', extra: true })
  ).rejects.toThrow('Invalid tool arguments')
  expect(await callTool(workspace, 'view:tool-demo', 'save_order', { id: 'a' })).toMatchObject({
    id: 'a',
    saved: before + 1
  })
  expect(await callServerTool(fixture, 'tool-demo', 'save_order', { id: 'b' })).toMatchObject({
    id: 'b',
    saved: before + 2
  })
  await expect(callServerTool(fixture, 'tool-demo', 'saveOrder', { id: 'c' })).rejects.toThrow(
    'Unknown server tool'
  )
  await expect(callServerTool(fixture, 'tool-demo', 'rich_result', {})).rejects.toThrow(
    'JSON-serializable'
  )
})

test('server calls work with multiple browser clients and never fall back on failure', async () => {
  const messages: string[] = []
  const a = { send: (message: string) => messages.push(message) },
    b = { send: (message: string) => messages.push(message) }
  for (const socket of [a, b])
    viewToolRelay.message(socket, {
      type: 'view-tool:presence',
      workspaceId: workspace.id,
      viewId: 'tool-demo',
      tools: []
    })
  try {
    expect(await callTool(workspace, 'view:tool-demo', 'read_saved')).toHaveProperty('saved')
    await expect(callTool(workspace, 'view:tool-demo', 'fail')).rejects.toThrow('backend failed')
    expect(messages).toEqual([])
    expect(await listTools(workspace, 'view:tool-demo')).toMatchObject({ ui: 'ambiguous' })
    viewToolRelay.message(a, {
      type: 'view-tool:presence',
      workspaceId: workspace.id,
      viewId: 'tool-demo',
      tools: [{ name: 'read_saved', description: 'Read saved', inputSchema: { type: 'object' } }]
    })
    await expect(callTool(workspace, 'view:tool-demo', 'read_saved')).rejects.toThrow(
      'Duplicate tool'
    )
  } finally {
    viewToolRelay.disconnect(a)
    viewToolRelay.disconnect(b)
  }
})

test('unified UI discovery and calls use the selected browser', async () => {
  const viewId = 'tool-demo.v2'
  const messages: Record<string, unknown>[] = []
  const socket = {
    send(message: string) {
      const request = JSON.parse(message)
      messages.push(request)
      queueMicrotask(() =>
        viewToolRelay.message(socket, {
          type: 'view-tool:result',
          requestId: request.requestId,
          result: { filter: 'all' }
        })
      )
    }
  }
  viewToolRelay.message(socket, {
    type: 'view-tool:presence',
    workspaceId: workspace.id,
    viewId,
    tools: [
      {
        name: 'set_filter',
        description: 'Filter orders',
        inputSchema: { type: 'object' }
      }
    ]
  })
  try {
    const catalog = await listTools(workspace, `view:${viewId}`)
    expect(JSON.stringify(catalog)).toContain('"runtime":"ui"')
    expect(await callTool(workspace, `view:${viewId}`, 'set_filter', {})).toEqual({ filter: 'all' })
    expect(messages.map(message => message.type)).toEqual(['view-tool:call'])
  } finally {
    viewToolRelay.disconnect(socket)
  }
})

test('cancels server tools and keeps the warm worker usable', async () => {
  const controller = new AbortController()
  const call = callServerTool(fixture, 'tool-demo', 'slow', {}, controller.signal)
  setTimeout(() => controller.abort(), 30)
  await expect(call).rejects.toThrow('cancelled')
  expect(await callServerTool(fixture, 'tool-demo', 'read_saved', {})).toHaveProperty('saved')
})

test('rejects malformed targets, tool names and non-object arguments', async () => {
  for (const target of [
    'agent',
    'widgets',
    'view-builder:draft',
    'widget:orders',
    'views:orders',
    'view:../orders',
    'view:orders/a'
  ]) {
    await expect(listTools(workspace, target)).rejects.toThrow('tool target')
  }
  for (const name of ['', 'save/order']) {
    await expect(callTool(workspace, 'view:tool-demo', name)).rejects.toThrow('tool name')
  }
  await expect(callTool(workspace, 'view:tool-demo', 'save_order', ['a'])).rejects.toThrow(
    'JSON object'
  )
  await expect(callTool(workspace, 'view:missing', 'nope')).rejects.toThrow('View unavailable')
})

test('bundling a view refreshes its server tools and imported backend code', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { handleBundleViews } = await import('./views')
  const path = await mkdtemp(join(import.meta.dir, 'tool-bundle-'))
  const previous = process.env.MEI_FUNCTIONS_DIR
  process.env.MEI_FUNCTIONS_DIR = join(path, '.moi')
  try {
    await Bun.write(
      join(path, '.moi/views/headless.server.ts'),
      `import { value } from '../shared'; let calls = 0; export const tools = { read: { description: 'Read value', inputSchema: { type: 'object' }, execute: async () => ({ value, calls: ++calls }) } }`
    )
    await Bun.write(
      join(path, '.moi/views/headless.tsx'),
      `export default function Headless() { return null }`
    )
    await Bun.write(join(path, '.moi/shared.ts'), 'export const value = 1')
    expect(await callTool({ id: 'headless', path }, 'view:headless', 'read')).toEqual({
      value: 1,
      calls: 1
    })
    await handleBundleViews(() => {}, 'headless', path)
    expect(await callTool({ id: 'headless', path }, 'view:headless', 'read')).toEqual({
      value: 1,
      calls: 1
    })
    await handleBundleViews(() => {}, 'headless', path)
    expect(await callTool({ id: 'headless', path }, 'view:headless', 'read')).toEqual({
      value: 1,
      calls: 2
    })
    await Bun.write(join(path, '.moi/shared.ts'), 'export const value = 2')
    await handleBundleViews(() => {}, 'headless', path)
    expect(await callTool({ id: 'headless', path }, 'view:headless', 'read')).toEqual({
      value: 2,
      calls: 1
    })
  } finally {
    restartWorker(path)
    process.env.MEI_FUNCTIONS_DIR = previous
    await rm(path, { recursive: true, force: true })
  }
})
