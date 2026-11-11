import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import * as client from '../remote/client'
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify, parse } from 'devalue'
import { api } from './index'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from '../workspaces/registry'
import { loadWorkspaceFileConfig, loadLayout, saveLayout } from '../workspaces/layout'
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
  base = `/api/remote/alice/workspaces/${ownerId}`
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
  // The gateway: owner-prefixed requests land on the owner's API (this same process).
  spies.push(
    spyOn(client, 'remoteConfig').mockResolvedValue({
      url: 'http://gateway.test/cloud',
      clientId: 'moi-cli',
      managed: false
    }),
    spyOn(globalThis, 'fetch').mockImplementation(
      Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(String(input))
          expect(url.origin).toBe('http://gateway.test')
          return api.request(url.pathname + url.search, init)
        },
        { preconnect: fetch.preconnect }
      )
    )
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

test('one workspace API serves owner content with the visitor\u2019s preferences', async () => {
  const list = await (await api.request('/api/workspaces')).json()
  expect(list.find((entry: { id: string }) => entry.id === visitorId)).toMatchObject({
    remote: { user_id: 'alice', workspace_id: ownerId },
    name: 'Owner board'
  })
  const layout = await (await api.request(local)).json()
  expect(layout).toMatchObject({
    name: 'Owner board',
    cwd: visitor,
    remote: { user_id: 'alice', workspace_id: ownerId },
    layoutMode: 'split',
    selectedModel: 'visitor-model'
  })
  expect(layout.widgetGrid).toBeDefined()
  expect((await api.request(`${local}/widgets`)).status).toBe(200)
  expect((await api.request(`${base}/widgets`)).status).toBe(200)
})

test('one save keeps shared edits on the owner and preferences with the visitor', async () => {
  const before = await loadLayout(owner)
  const saved = await api.request(
    local,
    put({
      ...before,
      widgetGrid: [{ i: 'counter', x: 1, y: 2 }],
      tabs: { open: ['overview', 'scratchpad'], active: 'scratchpad' },
      layoutMode: 'split',
      selectedModel: 'visitor-model'
    })
  )
  expect(saved.status).toBe(204)
  expect(await loadLayout(owner)).toMatchObject({
    layoutMode: 'fullscreen',
    selectedModel: 'owner-model',
    tabs: before.tabs,
    widgetGrid: [{ i: 'counter', x: 1, y: 2 }]
  })
  // A preferences-only save never touches the owner.
  expect((await api.request(local, put({ version: 2, layoutMode: 'fullscreen' }))).status).toBe(204)
  expect(await loadWorkspaceFileConfig(visitor)).toMatchObject({
    remote: { user_id: 'alice', workspace_id: ownerId },
    tabs: { active: 'scratchpad' },
    layoutMode: 'fullscreen',
    selectedModel: 'visitor-model'
  })
  expect((await loadLayout(owner)).widgetGrid).toEqual([{ i: 'counter', x: 1, y: 2 }])
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
  const bundle = await api.request(`${local}/views/counter/module`)
  expect(bundle.status).toBe(200)
  const text = await bundle.text()
  // Applet RPC and file URLs come back through the visitor's own API.
  expect(text).toContain(local)
  expect(text).not.toContain(base)
  expect(text).not.toContain(`"/api/workspaces/${ownerId}"`)
  const direct = await api.request(`/api/workspaces/${ownerId}/views/counter/module`)
  expect(bundle.headers.get('etag')).not.toBe(direct.headers.get('etag'))
  const response = await api.request(`${local}/rpc/views/counter/increment`, {
    method: 'POST',
    body: stringify([])
  })
  expect(response.status).toBe(200)
  expect(parse(await response.text())).toBe(1)
  expect(await Bun.file(join(owner, '.moi/count.json')).json()).toBe(1)
  expect(await Bun.file(join(visitor, '.moi/count.json')).exists()).toBe(false)
  await Bun.write(join(owner, 'hello.svg'), '<svg/>')
  expect(await (await api.request(`${local}/files/hello.svg`)).text()).toBe('<svg/>')
})

test('deferred operations and removing either workspace are blocked', async () => {
  for (const path of ['/sessions', '/state', '/harness'])
    expect((await api.request(base + path)).status).toBe(403)
  expect((await api.request(base, { method: 'DELETE' })).status).toBe(403)
  expect((await api.request(local, { method: 'DELETE' })).status).toBe(403)
  expect((await api.request(`${local}/views`, { method: 'POST' })).status).toBe(403)
  // Chat state is the visitor's own and never leaves this Moi.
  expect((await api.request(`${local}/state`)).status).toBe(200)
})

test('remote home preview reads the owner theme without exposing chats', async () => {
  await saveLayout(
    {
      ...createDefaultWorkspaceLayout(),
      theme: { color: 'mint', font: 'sans', radius: 'soft', agent: 'boxy' }
    },
    owner
  )
  const response = await api.request(`${base}/home-preview`)
  expect(response.status).toBe(200)
  const preview = await response.json()
  expect(preview.theme.color).toBe('mint')
  expect(preview.thumbnails).toEqual([])
  expect(preview.firstUserMessage).toBeUndefined()
  const previews = await (await api.request('/api/workspaces/previews')).json()
  expect(previews[visitorId].theme.color).toBe('mint')
})

test('remote scratchpad documents and assets stay on the owner', async () => {
  const document = { store: {}, schema: { schemaVersion: 2, sequences: {} } }
  expect((await api.request(`${base}/scratchpad`, put({ document }))).status).toBe(204)
  const loaded = await (await api.request(`${base}/scratchpad`)).json()
  expect(loaded.document).toEqual(document)
  expect(await Bun.file(join(visitor, '.moi/.scratchpad.json')).exists()).toBe(false)
  expect((await (await api.request(`${local}/scratchpad`)).json()).document).toEqual(document)
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

test('local, owner-route, and visitor log APIs read and clear the selected workspace journal', async () => {
  const { recordAppletError, getAppletLog } = await import('../applets/log')
  recordAppletError(visitor, { source: 'runtime', message: 'Visitor error' })
  for (const prefix of [`/api/workspaces/${ownerId}`, base, local]) {
    recordAppletError(owner, { source: 'runtime', message: 'Owner error' })
    const response = await api.request(`${prefix}/applet-log`)
    expect(response.status).toBe(200)
    expect(
      (await response.json()).entries.some(
        (entry: { message: string }) => entry.message === 'Owner error'
      )
    ).toBe(true)
    expect(
      (await (await api.request(`${prefix}/applet-log`, { method: 'DELETE' })).json()).cleared
    ).toBeGreaterThan(0)
    expect(getAppletLog(owner)).toHaveLength(0)
    expect(getAppletLog(visitor)).toHaveLength(1)
  }
})

test('local, owner-route, and visitor scratchpad edit APIs reuse the executor and preserve visitor data', async () => {
  const { readScratchpadShapes, readScratchpadImage } = await import('../scratchpad/document')
  const sharp = (await import('sharp')).default
  const image = await sharp({
    create: { width: 10, height: 10, channels: 3, background: '#ff0000' }
  })
    .png()
    .toBuffer()
  for (const prefix of [`/api/workspaces/${ownerId}`, base, local]) {
    const edit = async (op: unknown, bytes?: Uint8Array) => {
      const body = new FormData()
      body.set('op', JSON.stringify(op))
      if (bytes)
        body.set('image', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'visitor.png')
      return api.request(`${prefix}/scratchpad/ops`, { method: 'POST', body })
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
      (await edit({ kind: 'add-image', name: 'bad', path: '/owner/private.png', x: 0, y: 0 }))
        .status
    ).toBe(400)
  }
})
