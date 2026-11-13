import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse, stringify } from 'devalue'
import { createMockRemoteInvitations, createMockRemoteProxy } from './mock-remote-workspace'

describe('owner startup', () => {
  let root: string
  let origin: string
  let child: Bun.Subprocess
  const remoteConfig = {
    version: 2,
    remote: { user_id: 'alice', workspace_id: 'owner-board' },
    layoutMode: 'fullscreen'
  }
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'moi-mock-test-'))
    await mkdir(join(root, 'owner-board/.moi'), { recursive: true })
    await mkdir(join(root, 'visitor/.moi'), { recursive: true })
    await Bun.write(
      join(root, 'owner-board/.moi/.workspace.json'),
      JSON.stringify({
        version: 1,
        name: 'Shared counter',
        widgetGrid: [{ i: 'counter', x: 0, y: 0 }],
        selectedModel: 'keep-model'
      })
    )
    await Bun.write(join(root, 'owner-board/.moi/count.json'), '7')
    await Bun.write(join(root, 'visitor/.moi/.workspace.json'), JSON.stringify(remoteConfig))
    const spawned = Bun.spawn([process.execPath, 'scripts/mock-remote-workspace.ts'], {
      cwd: join(import.meta.dir, '..'),
      env: {
        ...process.env,
        MOCK_OWNER_DATA_DIR: root,
        MOCK_VISITOR_DIR: join(root, 'visitor'),
        MOCK_OWNER_PORT: '0',
        MOCK_PROXY_PORT: '0'
      },
      stdout: 'pipe',
      stderr: 'inherit'
    })
    child = spawned
    let output = ''
    const reader = spawned.stdout.getReader()
    try {
      while (!origin) {
        const chunk = await reader.read()
        if (chunk.done) throw new Error(`Mock exited: ${output}`)
        output += new TextDecoder().decode(chunk.value)
        origin = /Mock owner: (http:\/\/[^/]+)/.exec(output)?.[1] ?? ''
      }
    } finally {
      reader.releaseLock()
    }
  }, 30_000)
  afterAll(async () => {
    child?.kill('SIGTERM')
    if (child) await child.exited
    if (root) await rm(root, { recursive: true, force: true })
  })
  test('owner provides two launch widgets and a persistent plan without resetting visitor settings', async () => {
    const layout = await (await fetch(origin + '/api/workspaces/owner-board')).json()
    expect(layout.widgetGrid.map((item: { i: string }) => item.i)).toEqual([
      '_moi_views',
      'launch-brief',
      'launch-progress'
    ])
    expect(layout.selectedModel).toBe('keep-model')
    expect(await Bun.file(join(root, 'owner-board/.moi/count.json')).json()).toBe(7)
    expect(await Bun.file(join(root, 'visitor/.moi/.workspace.json')).json()).toEqual(remoteConfig)
    const { views } = await (await fetch(origin + '/api/workspaces/owner-board/views')).json()
    expect(views.some((view: { id: string }) => view.id === 'launch-plan')).toBe(true)
    expect(layout.name).toBe('Product launch')
    const widgets = await (await fetch(origin + '/api/workspaces/owner-board/widgets')).json()
    expect(widgets.widgets.map((widget: { id: string }) => widget.id).sort()).toEqual([
      'launch-brief',
      'launch-progress'
    ])
    const update = await fetch(
      origin + '/api/workspaces/owner-board/rpc/views/launch-plan/setDone',
      {
        method: 'POST',
        body: stringify(['landing', true])
      }
    )
    expect(update.status).toBe(200)
    expect(
      parse(await update.text()).find((task: { id: string }) => task.id === 'landing').done
    ).toBe(true)
    const read = await fetch(
      origin + '/api/workspaces/owner-board/rpc/widgets/launch-progress/read',
      {
        method: 'POST',
        body: stringify([])
      }
    )
    expect(
      parse(await read.text()).find((task: { id: string }) => task.id === 'landing').done
    ).toBe(true)
  })
})

// DOM typings hide Bun’s supported custom handshake headers.
const TestWebSocket = WebSocket as unknown as new (
  url: string,
  options: Bun.WebSocketOptions
) => WebSocket

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

async function setup() {
  const forwarded: string[] = []
  const batiok = Bun.serve({
    port: 0,
    fetch: (req, server) => {
      const path = new URL(req.url).pathname
      if (path === '/origin' || req.headers.get('upgrade') === 'websocket') {
        if (req.headers.get('origin') !== new URL(req.url).origin)
          return new Response('Invalid origin', { status: 403 })
        if (server.upgrade(req)) return
        return Response.json({
          origin: req.headers.get('origin'),
          referer: req.headers.get('referer')
        })
      }
      if (path === '/absolute-redirect')
        return Response.redirect(new URL('/cloud/login?next=%2F#signin', req.url).href)
      if (path === '/external-redirect') return Response.redirect('https://example.com/login')
      if (path === '/cloud/api/auth/get-session')
        return Response.json(
          req.headers.get('cookie') === 'session=visitor'
            ? {
                user: {
                  id: 'visitor',
                  name: 'Visitor',
                  email: 'visitor@example.com',
                  isAnonymous: false
                }
              }
            : null
        )
      forwarded.push(path)
      if (path === '/redirect')
        return new Response(null, {
          status: 302,
          headers: {
            location: '/cloud/login',
            'set-cookie': 'session=visitor; Path=/; HttpOnly'
          }
        })
      return new Response(req.body ?? 'visitor', { status: 200 })
    },
    websocket: {
      message: (ws, data) => {
        ws.send(data)
      }
    }
  })
  const owner = Bun.serve({
    port: 0,
    fetch: async (req, server) => {
      if (req.headers.get('upgrade') === 'websocket' && server.upgrade(req)) return
      return Response.json({
        path: new URL(req.url).pathname + new URL(req.url).search,
        method: req.method,
        body: await req.text()
      })
    },
    websocket: {
      message: (ws, data) => {
        ws.send(data)
      }
    }
  })
  cleanups.push(
    () => batiok.stop(true),
    () => owner.stop(true)
  )
  const proxy = createMockRemoteProxy(batiok.url.origin, owner.url.origin)
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve))
  cleanups.push(() => {
    proxy.closeAllConnections()
    proxy.close()
  })
  const address = proxy.address()
  if (!address || typeof address === 'string') throw new Error('Missing proxy port')
  const origin = `http://127.0.0.1:${address.port}`
  const request = (path: string, init?: RequestInit) =>
    fetch(origin + path, {
      ...init,
      headers: { cookie: 'session=visitor', ...init?.headers },
      redirect: 'manual'
    })
  return { origin, request, forwarded, batiokOrigin: batiok.url.origin }
}

test('proxy supports invitation → accept → discovery and leaves registration on the visitor', async () => {
  const { origin, request, forwarded } = await setup()
  expect((await fetch(origin + '/cloud/api/workspaces/invitations')).status).toBe(401)
  expect(
    (await (await request('/cloud/api/workspaces/invitations')).json()).invitations
  ).toHaveLength(1)
  expect(await (await request('/cloud/api/workspaces/shared')).json()).toEqual({ workspaces: [] })
  expect(
    (
      await request('/cloud/api/invitations/mock-owner-invite/accept', {
        method: 'POST',
        body: '{}'
      })
    ).status
  ).toBe(200)
  expect((await (await request('/cloud/api/workspaces/invitations')).json()).invitations).toEqual(
    []
  )
  expect((await (await request('/cloud/api/workspaces/shared')).json()).workspaces[0].id).toBe(
    'owner-board'
  )
  const remote = { user_id: 'alice', workspace_id: 'owner-board' }
  expect(
    await (
      await request('/api/workspaces/shared/open', { method: 'POST', body: JSON.stringify(remote) })
    ).json()
  ).toEqual(remote)
  expect(forwarded).toContain('/api/workspaces/shared/open')
  const owner = await request(
    '/api/workspaces/alice:owner-board/rpc/counter/increment?revision=2',
    { method: 'POST', body: '[]' }
  )
  expect(await owner.json()).toEqual({
    path: '/api/workspaces/owner-board/rpc/counter/increment?revision=2',
    method: 'POST',
    body: '[]'
  })
  expect(
    (await (await request('/cloud/api/workspaces/alice:owner-board/members')).json()).members
  ).toHaveLength(3)
  await request('/api/workspaces/other:board')
  expect(forwarded).toContain('/api/workspaces/other:board')
  const redirect = await request('/redirect')
  expect(redirect.status).toBe(302)
  expect(redirect.headers.get('location')).toBe('/cloud/login')
  expect(redirect.headers.get('set-cookie')).toContain('session=visitor')
})

test('proxy tunnels visitor and owner WebSockets', async () => {
  const { origin } = await setup()
  for (const path of ['/ws', '/api/workspaces/alice:owner-board/collab']) {
    await new Promise<void>((resolve, reject) => {
      const socket = new TestWebSocket(origin.replace('http:', 'ws:') + path, {
        headers: { origin }
      })
      const timeout = setTimeout(() => {
        socket.close()
        reject(new Error('WebSocket timed out'))
      }, 2000)
      socket.onopen = () => socket.send('hello')
      socket.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('WebSocket failed'))
      }
      socket.onmessage = event => {
        try {
          expect(event.data).toBe('hello')
          resolve()
        } catch (error) {
          reject(error)
        } finally {
          clearTimeout(timeout)
          socket.close()
        }
      }
    })
  }
})

test('proxy translates its origin and local redirects while normal Batiok stays usable', async () => {
  const { origin, request, batiokOrigin } = await setup()
  const response = await request('/origin', {
    method: 'POST',
    headers: { origin, referer: `${origin}/workspace/board?tab=overview` }
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    origin: batiokOrigin,
    referer: `${batiokOrigin}/workspace/board?tab=overview`
  })
  expect(
    (await request('/origin', { method: 'POST', headers: { origin: 'https://foreign.example' } }))
      .status
  ).toBe(403)
  expect((await request('/origin', { method: 'POST' })).status).toBe(403)
  expect(
    (await fetch(`${batiokOrigin}/origin`, { method: 'POST', headers: { origin: batiokOrigin } }))
      .status
  ).toBe(200)
  expect((await request('/absolute-redirect')).headers.get('location')).toBe(
    '/cloud/login?next=%2F#signin'
  )
  expect((await request('/external-redirect')).headers.get('location')).toBe(
    'https://example.com/login'
  )
})

test('invitation acceptance reveals the share for that viewer and resets on restart', async () => {
  const cloud = createMockRemoteInvitations()
  const request = (path: string, method = 'GET', id = 'visitor') =>
    new Request(`http://localhost/mock/cloud/api/${path}`, {
      method,
      headers: {
        'x-moi-mock-viewer': encodeURIComponent(
          JSON.stringify({
            id,
            type: 'user',
            name: 'Visitor',
            email: `${id}@example.com`,
            isAnonymous: false
          })
        )
      }
    })
  const pending = await (await cloud(request('workspaces/invitations'))).json()
  expect(pending.invitations).toEqual([
    { id: 'mock-owner-invite', workspaceName: 'Product launch', inviter: { name: 'Alice' } }
  ])
  expect(await (await cloud(request('workspaces/shared'))).json()).toEqual({ workspaces: [] })
  const accept = () => cloud(request('invitations/mock-owner-invite/accept', 'POST'))
  expect(await (await accept()).json()).toMatchObject({
    success: true,
    remote: { user_id: 'alice', workspace_id: 'owner-board' }
  })
  await accept()
  expect(await (await cloud(request('workspaces/invitations'))).json()).toEqual({ invitations: [] })
  expect(await (await cloud(request('workspaces/shared'))).json()).toEqual({
    workspaces: [
      { id: 'owner-board', name: 'Product launch', owner: { id: 'alice', name: 'Alice' } }
    ]
  })
  const sharing = request('workspaces/shared')
  const members = await (
    await cloud(new Request('http://localhost/mock/sharing/members', sharing))
  ).json()
  expect(members.members.filter((member: { id: string }) => member.id === 'visitor')).toHaveLength(
    1
  )
  expect(
    await (await cloud(request('workspaces/shared', 'GET', 'another-visitor'))).json()
  ).toEqual({ workspaces: [] })
  expect(
    (await (await createMockRemoteInvitations()(request('workspaces/invitations'))).json())
      .invitations
  ).toHaveLength(1)
  expect(
    (await cloud(new Request('http://localhost/mock/cloud/api/workspaces/shared'))).status
  ).toBe(401)
})

test('mock membership supports invites, revocation and removal while keeping the host', async () => {
  const cloud = createMockRemoteInvitations()
  const headers = {
    'content-type': 'application/json',
    'x-moi-mock-viewer': encodeURIComponent(
      JSON.stringify({
        id: 'visitor',
        type: 'user',
        name: 'Visitor',
        email: 'visitor@example.com',
        isAnonymous: false
      })
    )
  }
  const sharing = (path: string, init?: RequestInit) =>
    cloud(new Request('http://localhost/mock/sharing' + path, { ...init, headers }))
  await cloud(
    new Request('http://localhost/mock/cloud/api/invitations/mock-owner-invite/accept', {
      method: 'POST',
      headers
    })
  )
  expect((await cloud(new Request('http://localhost/mock/sharing/members'))).status).toBe(401)
  let snapshot = await (await sharing('/members')).json()
  expect(snapshot.members.map((member: { id: string }) => member.id)).toEqual([
    'alice',
    'jamie',
    'visitor'
  ])
  expect(
    (
      await sharing('/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: 'NEW@example.com' })
      })
    ).status
  ).toBe(200)
  snapshot = await (await sharing('/members')).json()
  expect(snapshot.invitations[0].email).toBe('new@example.com')
  expect(
    (await sharing('/invitations/' + snapshot.invitations[0].id, { method: 'DELETE' })).status
  ).toBe(200)
  expect((await sharing('/members/member-jamie', { method: 'DELETE' })).status).toBe(200)
  expect((await sharing('/members/alice', { method: 'DELETE' })).status).toBe(404)
  snapshot = await (await sharing('/members')).json()
  expect(snapshot.invitations).toEqual([])
  expect(snapshot.members.map((member: { id: string }) => member.id)).toEqual(['alice', 'visitor'])
})
