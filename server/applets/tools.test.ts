import { afterAll, beforeAll, expect, test } from 'bun:test'
import { parse, stringify } from 'devalue'
import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { callFunction, restartWorker } from './functions'
import { callTool, listTools } from './tools'
import { handleBundleViews } from './views'

let root: string
const previousFunctionsDir = process.env.MEI_FUNCTIONS_DIR

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'moi-tools-'))
  process.env.MEI_FUNCTIONS_DIR = join(root, '.moi')
  for (const name of ['tool-demo', 'legacy-tools']) {
    await Bun.write(
      join(root, `.moi/views/${name}.server.ts`),
      await Bun.file(join(import.meta.dir, `../test/__fixtures__/views/${name}.server.ts`)).text()
    )
  }
  await symlink(join(import.meta.dir, '../../node_modules'), join(root, '.moi/node_modules'))
})
afterAll(async () => {
  restartWorker(root)
  if (previousFunctionsDir === undefined) delete process.env.MEI_FUNCTIONS_DIR
  else process.env.MEI_FUNCTIONS_DIR = previousFunctionsDir
  await rm(root, { recursive: true, force: true })
})

test('discovers only explicit tools, with no browser or frontend required', async () => {
  const catalog = await listTools(root, 'view:tool-demo')
  expect(catalog.map(tool => tool.name)).toContain('save_order')
  const text = JSON.stringify(catalog)
  for (const privateText of ['execute', 'server-only-tool-implementation', 'saveOrder'])
    expect(text).not.toContain(privateText)
  expect(await listTools(root, 'view:missing')).toEqual([])
  expect(await listTools(root, 'view:legacy-tools')).toEqual([])
  expect(parse(await callFunction('views/legacy-tools', 'tools', stringify(['a']), root))).toEqual({
    id: 'a',
    updated: new Date('2026-01-01T00:00:00Z')
  })
})

test('server validation rejects invalid calls before mutation and preserves legacy RPC', async () => {
  const before = parse(
    await callFunction('views/tool-demo', 'getSaved', stringify([]), root)
  ) as number
  for (const args of [{}, { id: 'a', extra: true }, { id: 12 }, ['a']])
    await expect(callTool(root, 'view:tool-demo', 'save_order', args)).rejects.toThrow()
  expect(await callTool(root, 'view:tool-demo', 'save_order', { id: 'a' })).toMatchObject({
    id: 'a',
    saved: before + 1
  })
  expect(parse(await callFunction('views/tool-demo', 'getSaved', stringify([]), root))).toBe(
    before + 1
  )
  await expect(callTool(root, 'view:tool-demo', 'saveOrder', {})).rejects.toThrow(
    'Unknown server tool'
  )
  await expect(callTool(root, 'view:tool-demo', 'rich_result', {})).rejects.toThrow(
    'JSON-serializable'
  )
  await expect(callTool(root, 'view:tool-demo', 'fail', {})).rejects.toThrow('backend failed')
})

test('cancellation reaches the worker and leaves it usable', async () => {
  const controller = new AbortController()
  const call = callTool(root, 'view:tool-demo', 'slow', {}, controller.signal)
  setTimeout(() => controller.abort(), 30)
  await expect(call).rejects.toThrow('cancelled')
  expect(await callTool(root, 'view:tool-demo', 'read_saved')).toHaveProperty('saved')
})

test('rejects traversal, unsupported targets and invalid tool names', async () => {
  for (const target of ['view:../orders', 'view:orders/a', 'widget:orders', 'scratchpad', 'view:'])
    await expect(listTools(root, target)).rejects.toThrow('tool target')
  await expect(callTool(root, 'view:tool-demo', '../save')).rejects.toThrow('tool name')
})

test('bundling tracks unimported companions, their dependencies, deletion and re-addition', async () => {
  const companion = join(root, '.moi/views/headless.server.ts')
  const source = `import { value } from '../shared'; let calls = 0; export const tools = { read: { description: 'Read value', inputSchema: { type: 'object' }, execute: async () => ({ value, calls: ++calls }) } }`
  await Bun.write(companion, source)
  await Bun.write(
    join(root, '.moi/views/headless.tsx'),
    'export default function Headless() { return null }'
  )
  await Bun.write(join(root, '.moi/shared.ts'), 'export const value = 1')
  restartWorker(root)
  expect(await callTool(root, 'view:headless', 'read')).toEqual({ value: 1, calls: 1 })
  await handleBundleViews(() => {}, 'tools-test', root)
  expect(await callTool(root, 'view:headless', 'read')).toEqual({ value: 1, calls: 1 })
  await handleBundleViews(() => {}, 'tools-test', root)
  expect(await callTool(root, 'view:headless', 'read')).toEqual({ value: 1, calls: 2 })
  await Bun.write(join(root, '.moi/shared.ts'), 'export const value = 2')
  await handleBundleViews(() => {}, 'tools-test', root)
  expect(await callTool(root, 'view:headless', 'read')).toEqual({ value: 2, calls: 1 })
  await rm(companion)
  await handleBundleViews(() => {}, 'tools-test', root)
  expect(await listTools(root, 'view:headless')).toEqual([])
  await expect(callTool(root, 'view:headless', 'read')).rejects.toThrow('not found')
  await Bun.write(companion, source)
  await handleBundleViews(() => {}, 'tools-test', root)
  expect(await callTool(root, 'view:headless', 'read')).toEqual({ value: 2, calls: 1 })
}, 20_000)
