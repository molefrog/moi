import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import * as appConfig from '../app-config'
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify, parse } from 'devalue'
import { api } from './index'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from '../workspaces/registry'
import { loadLayout, saveLayout } from '../workspaces/layout'
import { buildAllViews } from '../applets/views'
import { killAllWorkers } from '../applets/functions'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'

let root: string, owner: string, visitor: string, ownerId: string, visitorId: string, base: string
let local: string
const spies: { mockRestore(): void }[] = []
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'moi-remote-'))
  owner = join(root, 'owner-board')
  visitor = join(root, 'visitor-alias')
  await mkdir(join(owner, '.moi/views'), { recursive: true })
  await mkdir(join(visitor, '.moi'), { recursive: true })
  setRegistryPath(join(root, 'registry.json'))
  ownerId = (await registerWorkspace(owner)).id
  visitorId = (await registerWorkspace(visitor)).id
  base = `/api/workspaces/${ownerId}`
  await saveLayout(
    {
      ...createDefaultWorkspaceLayout(),
      name: 'Owner board',
      layoutMode: 'fullscreen',
      selectedModel: 'owner-model'
    },
    owner
  )
  await Bun.write(
    join(visitor, '.moi/.workspace.json'),
    JSON.stringify({
      version: 2,
      remote: { user_id: 'alice', workspace_id: ownerId },
      layoutMode: 'split',
      selectedModel: 'visitor-model'
    })
  )
  local = `/api/workspaces/${visitorId}`
  spies.push(
    spyOn(appConfig, 'getAppConfig').mockReturnValue({
      ...appConfig.getAppConfig(),
      environment: 'cloud'
    })
  )
})
afterEach(async () => {
  for (const spy of spies.splice(0)) spy.mockRestore()
  killAllWorkers()
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(root, { recursive: true, force: true })
})
const put = (body: unknown) => ({
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
})

test('visitor API returns the reference, folder and resolved routing', async () => {
  const list = await (await api.request('/api/workspaces')).json()
  expect(list.find((entry: { id: string }) => entry.id === visitorId)).toMatchObject({
    remote: { user_id: 'alice', workspace_id: ownerId },
    name: ownerId
  })
  const layout = await (await api.request(local)).json()
  expect(layout).toMatchObject({
    cwd: visitor,
    apiBase: `/api/workspaces/alice:${ownerId}`,
    isRemote: true,
    remote: { user_id: 'alice', workspace_id: ownerId }
  })
  expect(layout.widgetGrid).toBeUndefined()
  expect(layout.selectedModel).toBeUndefined()
  expect(layout.tabs).toBeUndefined()
  expect((await api.request(`${base}/widgets`)).status).toBe(200)
})

test('local workspace info includes routing without persisting response metadata', async () => {
  const info = await (await api.request(base)).json()
  expect(info).toMatchObject({ apiBase: base, isRemote: false, name: 'Owner board' })
  expect((await api.request(base, put(info))).status).toBe(204)
  const saved = await Bun.file(join(owner, '.moi/.workspace.json')).json()
  expect(saved).not.toHaveProperty('apiBase')
  expect(saved).not.toHaveProperty('isRemote')
})

test('visitor layout writes cannot add preferences or overwrite the reference', async () => {
  const before = await Bun.file(join(visitor, '.moi/.workspace.json')).text()
  const ownerBefore = await loadLayout(owner)
  const response = await api.request(
    local,
    put({
      version: 2,
      layoutMode: 'fullscreen',
      tabs: { open: ['scratchpad'], active: 'scratchpad' }
    })
  )
  expect(response.status).toBe(403)
  expect(await Bun.file(join(visitor, '.moi/.workspace.json')).text()).toBe(before)
  expect(await loadLayout(owner)).toEqual(ownerBefore)
})

test('remote bundle RPC reads and writes owner data; assets and validators retain the destination', async () => {
  await symlink(join(import.meta.dir, '../../node_modules'), join(owner, '.moi/node_modules'))
  await Bun.write(
    join(owner, '.moi/views/counter.tsx'),
    `import { increment } from './counter.server'; export const config = { title: 'Counter' }; export default function Counter() { return <button onClick={() => increment()}>Increment</button> }`
  )
  await Bun.write(
    join(owner, '.moi/views/counter.server.ts'),
    `import { join } from 'node:path'; const path = join(import.meta.dir, '../count.json'); export async function increment() { const n = await Bun.file(path).json().catch(() => 0); await Bun.write(path, JSON.stringify(n + 1)); return n + 1 }`
  )
  await buildAllViews(owner)
  const bundle = await api.request(`${base}/views/counter/module`)
  expect(bundle.status).toBe(200)
  const etag = bundle.headers.get('etag')!
  const legacyEtag = etag.replace('-url-base-v2', '')
  expect(
    (
      await api.request(`${base}/views/counter/module`, {
        headers: { 'if-none-match': legacyEtag }
      })
    ).status
  ).toBe(200)
  expect(
    (
      await api.request(`${base}/views/counter/module`, {
        headers: { 'if-none-match': etag }
      })
    ).status
  ).toBe(304)
  const text = await bundle.text()
  expect(text).toContain('new URL(import.meta.url)')
  // Execute the served module with the URL it has behind Batiok, without a DOM.
  // Parsing the entire bundle also catches invalid substitutions in minified code.
  const publicUrl = `http://cloud.test/api/workspaces/alice:${ownerId}/views/counter/module`
  const source = text.replaceAll('import.meta.url', JSON.stringify(publicUrl))
  new Bun.Transpiler({ loader: 'js' }).scan(source)
  const expression = source.match(/\(new URL\([^\n]+?\?\.\[0\] \?\? [^\n]+?\)/)?.[0]
  expect(expression).toBeDefined()
  expect(new Function(`return ${expression}`)()).toBe(`/api/workspaces/alice:${ownerId}`)
  const response = await api.request(`${base}/rpc/views/counter/increment`, {
    method: 'POST',
    body: stringify([])
  })
  expect(response.status).toBe(200)
  expect(parse(await response.text())).toBe(1)
  expect(await Bun.file(join(owner, '.moi/count.json')).json()).toBe(1)
  expect(await Bun.file(join(visitor, '.moi/count.json')).exists()).toBe(false)
  await Bun.write(join(owner, 'hello.svg'), '<svg/>')
  expect(await (await api.request(`${base}/files/hello.svg`)).text()).toBe('<svg/>')
})

test('remote reference serves no shared content and keeps personal state local', async () => {
  for (const path of ['/widgets', '/views', '/scratchpad', '/config'])
    expect([path, (await api.request(local + path)).status]).toEqual([path, 404])
  expect((await api.request(`${local}/views`, { method: 'POST' })).status).toBe(404)
  expect((await api.request(local, { method: 'DELETE' })).status).toBe(403)
  // Chat state is the visitor's own and never leaves this Moi.
  expect((await api.request(`${local}/state`)).status).toBe(200)
  const previews = await (await api.request('/api/workspaces/previews')).json()
  expect(previews[visitorId]).toEqual({ thumbnails: [] })
})

test('remote scratchpad documents and assets stay on the owner', async () => {
  const document = { store: {}, schema: { schemaVersion: 2, sequences: {} } }
  expect((await api.request(`${base}/scratchpad`, put({ document }))).status).toBe(204)
  const loaded = await (await api.request(`${base}/scratchpad`)).json()
  expect(loaded.document).toEqual(document)
  expect(await Bun.file(join(visitor, '.moi/.scratchpad.json')).exists()).toBe(false)
  const upload = await api.request(`${base}/scratchpad/assets`, {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: new Uint8Array([1, 2, 3])
  })
  expect(upload.status).toBe(200)
  const { src } = await upload.json()
  const asset = await api.request(`${base}/scratchpad/assets/${src.slice('asset:'.length)}`)
  expect(asset.status).toBe(200)
  expect(new Uint8Array(await asset.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
})

test('scratchpad edit API runs ops on the owner and never reads caller paths', async () => {
  const { readScratchpadShapes, readScratchpadImage } = await import('../scratchpad/document')
  const sharp = (await import('sharp')).default
  const image = await sharp({
    create: { width: 10, height: 10, channels: 3, background: '#ff0000' }
  })
    .png()
    .toBuffer()
  const edit = async (op: unknown, bytes?: Uint8Array) => {
    const body = new FormData()
    body.set('op', JSON.stringify(op))
    if (bytes)
      body.set('image', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'visitor.png')
    return api.request(`${base}/scratchpad/ops`, { method: 'POST', body })
  }
  expect((await edit({ kind: 'add-text', name: 'note', x: 1, y: 2, text: 'Hello' })).status).toBe(
    200
  )
  expect((await edit({ kind: 'move', name: 'note', x: 30, y: 40 })).status).toBe(200)
  expect((await edit({ kind: 'set', name: 'note', text: 'Updated' })).status).toBe(200)
  expect((await readScratchpadShapes(owner))[0]).toMatchObject({
    id: 'note',
    x: 30,
    y: 40,
    text: 'Updated'
  })
  expect(
    (
      await edit(
        { kind: 'add-image', name: 'photo', path: '/visitor-only/image.png', x: 0, y: 0 },
        image
      )
    ).status
  ).toBe(200)
  expect(await readScratchpadImage(owner, 'photo')).toMatchObject({
    src: expect.stringContaining('data:image/')
  })
  expect((await edit({ kind: 'delete', name: 'note' })).status).toBe(200)
  expect((await readScratchpadShapes(owner)).map(shape => shape.id)).toEqual(['photo'])
  expect((await edit({ kind: 'clear' })).status).toBe(200)
  expect(await readScratchpadShapes(owner)).toEqual([])
  expect(await readScratchpadShapes(visitor)).toEqual([])
  expect((await edit({ kind: 'view' })).status).toBe(400)
  expect((await edit({ kind: 'unknown' })).status).toBe(400)
  expect(await readScratchpadShapes(owner)).toEqual([])
  expect(
    (await edit({ kind: 'add-image', name: 'bad', path: '/owner/private.png', x: 0, y: 0 })).status
  ).toBe(400)
})

test('standalone hides remote registrations and refuses remote opening', async () => {
  const spy = spyOn(appConfig, 'getAppConfig').mockReturnValue({
    ...appConfig.getAppConfig(),
    environment: 'local'
  })
  try {
    expect((await api.request(local)).status).toBe(403)
    expect(
      (await (await api.request('/api/workspaces')).json()).some(
        (entry: { id: string }) => entry.id === visitorId
      )
    ).toBe(false)
    expect(
      (
        await api.request('/api/workspaces/shared/open', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ user_id: 'alice', workspace_id: ownerId })
        })
      ).status
    ).toBe(403)
    expect((await api.request(base)).status).toBe(200)
  } finally {
    spy.mockRestore()
  }
})

test('standalone can reorder visible workspaces while preserving remote registrations', async () => {
  spies.push(
    spyOn(appConfig, 'getAppConfig').mockReturnValue({
      ...appConfig.getAppConfig(),
      environment: 'local'
    })
  )
  const response = await api.request('/api/workspaces/order', put({ ids: [ownerId] }))
  expect(response.status).toBe(200)
  expect((await response.json()).map((entry: { id: string }) => entry.id)).toEqual([ownerId])
  const { listWorkspaces } = await import('../workspaces/registry')
  expect((await listWorkspaces()).map(entry => entry.id)).toEqual([ownerId, visitorId])
})

test('shared layout edits preserve owner preferences and local config version', async () => {
  const previous = await loadLayout(owner)
  await saveLayout({ ...previous, selectedEffort: 'high', selectedSpeedMode: 'fast' }, owner)
  expect((await api.request(base, put({ version: 1, widgetGrid: [] }))).status).toBe(204)
  expect(await loadLayout(owner)).toMatchObject({
    version: 1,
    selectedModel: 'owner-model',
    selectedEffort: 'high',
    selectedSpeedMode: 'fast',
    tabs: previous.tabs,
    layoutMode: previous.layoutMode,
    widgetGrid: []
  })
})
