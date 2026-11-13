import { provisionWorkspace } from '../workspaces/init'
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { api } from '../api'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from '../workspaces/registry'
import { initializeRemoteWorkspaceConfig, loadLayout, saveLayout } from '../workspaces/layout'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'

let root: string, visitor: string, owner: string, data: string
let cloud: ReturnType<typeof Bun.serve>, control: ReturnType<typeof Bun.serve>
let image: Uint8Array<ArrayBuffer>
const ownerRequests: string[] = []
const browserRequests: Record<string, unknown>[] = []

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'moi-remote-actions-')))
  visitor = join(root, 'visitor')
  owner = join(root, 'owner')
  data = join(root, 'data')
  await mkdir(join(owner, '.moi'), { recursive: true })
  await initializeRemoteWorkspaceConfig(visitor, { user_id: 'alice', workspace_id: 'board' })
  await provisionWorkspace(visitor)
  setRegistryPath(join(root, 'registry.json'))
  await registerWorkspace(owner, { id: 'board' })
  await saveLayout({ ...createDefaultWorkspaceLayout(), name: 'Owner board' }, owner)
  image = new Uint8Array(
    await sharp({
      create: { width: 8, height: 8, channels: 4, background: '#ff0000' }
    })
      .png()
      .toBuffer()
  )
  await Bun.write(join(visitor, 'image.png'), image)
  cloud = Bun.serve({
    port: 0,
    async fetch(request) {
      expect(request.headers.get('authorization')).toStartWith('Bearer ')
      const url = new URL(request.url)
      ownerRequests.push(`${request.method} ${url.pathname}`)
      // Exercise real owner handlers, including image processing and canvas persistence.
      url.pathname = url.pathname.replace('/api/workspaces/alice:board', '/api/workspaces/board')
      const response = await api.fetch(new Request(url, request))
      if (!response.ok) console.error(await response.clone().text())
      return response
    }
  })
  control = Bun.serve({
    port: 0,
    fetch(request, server) {
      if (server.upgrade(request, { data: {} })) return
      return new Response('Not found', { status: 404 })
    },
    websocket: {
      message(socket, message) {
        const payload = JSON.parse(String(message)) as Record<string, unknown>
        browserRequests.push(payload)
        socket.send(
          JSON.stringify(
            payload.type === 'scratch'
              ? {
                  ok: true,
                  result: {
                    image: `data:image/png;base64,${Buffer.from(image).toString('base64')}`
                  }
                }
              : { ok: true }
          )
        )
      }
    }
  })
  const url = `http://localhost:${cloud.port}/cloud`
  await Bun.write(join(data, 'config.json'), JSON.stringify({ remote: { url } }))
  const claims = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString('base64url')
  await Bun.write(
    join(data, 'remote-auth.json'),
    JSON.stringify({
      url,
      clientId: 'moi-cli',
      accessToken: `e30.${claims}.test`,
      refreshToken: 'test'
    })
  )
})
afterAll(async () => {
  cloud?.stop(true)
  control?.stop(true)
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(root, { recursive: true, force: true })
})
async function cli(args: string[]) {
  const child = Bun.spawn([process.execPath, join(import.meta.dir, '../cli.ts'), ...args], {
    cwd: visitor,
    env: {
      ...process.env,
      MOI_DATA_DIR: data,
      MOI_CONTROL_PORT: String(control.port),
      NO_COLOR: '1'
    },
    stdout: 'pipe',
    stderr: 'pipe'
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited
  ])
  expect({ code, stderr }).toEqual({ code: 0, stderr: '' })
  return stdout
}

test('config uploads caller bytes and changes only the owner config', async () => {
  await cli(['config', 'icon', './image.png'])
  expect((await loadLayout(owner)).icon?.type).toBe('upload')
  expect(await Bun.file(join(owner, 'image.png')).exists()).toBe(false)
  await cli(['config', 'name', 'Shared title'])
  expect((await loadLayout(owner)).name).toBe('Shared title')
  expect(await Bun.file(join(visitor, '.moi/.workspace.json')).json()).toEqual({
    version: 2,
    remote: { user_id: 'alice', workspace_id: 'board' }
  })
})

test('scratch uploads caller images and downloads owner pixels into caller paths', async () => {
  await cli(['scratch', 'add', 'image', './image.png', '--id', 'photo'])
  const shapes = JSON.parse(await cli(['scratch', 'read'])) as { id: string }[]
  expect(shapes.some(shape => shape.id === 'photo')).toBe(true)
  await cli(['scratch', 'read-image', 'photo', '--out', './download.png'])
  const downloaded = await Bun.file(join(visitor, 'download.png')).arrayBuffer()
  const metadata = await sharp(downloaded).metadata()
  expect(metadata.width).toBe(8)
  expect(metadata.height).toBe(8)
  expect(await Bun.file(join(owner, 'download.png')).exists()).toBe(false)
  expect(await Bun.file(join(visitor, '.moi/.scratchpad.json')).exists()).toBe(false)
})

test('tabs uses the owner views endpoint without dispatching an owner CLI', async () => {
  const before = ownerRequests.length
  expect(await cli(['tabs'])).toContain('moi:/overview')
  expect(ownerRequests.slice(before)).toEqual(['GET /api/workspaces/alice:board/views'])
})

test('refresh and canvas rendering reach visitor control and write output locally', async () => {
  const before = ownerRequests.length
  await cli(['refresh', '--only', 'widgets/counter'])
  expect(browserRequests.at(-1)).toEqual({
    type: 'applets:refresh',
    only: 'widgets/counter',
    path: visitor
  })
  await cli(['scratch', 'view', '--out', './canvas.png'])
  expect(browserRequests.at(-1)).toEqual({ type: 'scratch', path: visitor, op: { kind: 'view' } })
  expect(new Uint8Array(await Bun.file(join(visitor, 'canvas.png')).arrayBuffer())).toEqual(image)
  expect(await Bun.file(join(owner, 'canvas.png')).exists()).toBe(false)
  expect(ownerRequests.length).toBe(before)
})
