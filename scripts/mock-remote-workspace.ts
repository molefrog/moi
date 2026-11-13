// Local remote-workspace fixture and browser proxy.
import { mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer, request as httpRequest, type IncomingMessage } from 'node:http'
import { connect } from 'node:net'
import { Readable } from 'node:stream'

// Local-only Cloud fixture. State resets when the mock owner restarts.
type MockMember = {
  id: string
  type: 'user'
  name: string
  email: string
  isAnonymous: boolean
  membershipId?: string
}
export function createMockRemoteInvitations() {
  const accepted = new Set<string>()
  const members: MockMember[] = [
    { id: 'alice', type: 'user', name: 'Alice', email: 'alice@example.com', isAnonymous: false },
    {
      id: 'jamie',
      type: 'user',
      name: 'Jamie',
      email: 'jamie@example.com',
      isAnonymous: false,
      membershipId: 'member-jamie'
    }
  ]
  const invitations: { id: string; email: string; expiresAt: string }[] = []
  return async function (request: Request): Promise<Response> {
    const path = new URL(request.url).pathname
    const suffix = path.slice('/mock/sharing'.length)
    const viewerHeader = request.headers.get('x-moi-mock-viewer')
    if (!viewerHeader) return Response.json({ error: 'Sign in required' }, { status: 401 })
    const viewer = JSON.parse(decodeURIComponent(viewerHeader)) as MockMember
    if (path === '/mock/cloud/api/workspaces/invitations' && request.method === 'GET')
      return Response.json({
        invitations: accepted.has(viewer.id)
          ? []
          : [
              {
                id: 'mock-owner-invite',
                workspaceName: 'Shared counter',
                inviter: { name: 'Alice' }
              }
            ]
      })
    if (
      path === '/mock/cloud/api/invitations/mock-owner-invite/accept' &&
      request.method === 'POST'
    ) {
      accepted.add(viewer.id)
      if (!members.some(member => member.id === viewer.id))
        members.push({ ...viewer, membershipId: `member-${viewer.id}` })
      return Response.json({
        success: true,
        remote: { user_id: 'alice', workspace_id: 'owner-board' },
        membershipId: `member-${viewer.id}`
      })
    }
    if (path === '/mock/cloud/api/workspaces/shared' && request.method === 'GET')
      return Response.json({
        workspaces: accepted.has(viewer.id)
          ? [
              {
                id: 'owner-board',
                name: 'Shared counter',
                owner: { id: 'alice', name: 'Alice' }
              }
            ]
          : []
      })
    if (!accepted.has(viewer.id))
      return Response.json({ error: 'Accept the mock invitation first' }, { status: 403 })
    if (suffix === '/members' && request.method === 'GET')
      return Response.json({ members, invitations }, { headers: { 'cache-control': 'no-store' } })
    if (suffix === '/invitations' && request.method === 'POST') {
      const { email } = (await request.json()) as { email?: string }
      if (!email || !email.includes('@'))
        return Response.json({ error: 'Enter an email address' }, { status: 400 })
      const normalized = email.trim().toLowerCase()
      if (
        members.some(member => member.email.toLowerCase() === normalized) ||
        invitations.some(invite => invite.email === normalized)
      )
        return Response.json({ error: 'Already a member or invited' }, { status: 409 })
      invitations.push({
        id: crypto.randomUUID(),
        email: normalized,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString()
      })
      return Response.json({ success: true })
    }
    if (request.method === 'DELETE') {
      const [, collection, id] = suffix.split('/')
      const index =
        collection === 'members'
          ? members.findIndex(member => member.membershipId === id)
          : collection === 'invitations'
            ? invitations.findIndex(invite => invite.id === id)
            : -1
      if (index < 0) return Response.json({ error: 'Not found' }, { status: 404 })
      if (collection === 'members') members.splice(index, 1)
      else invitations.splice(index, 1)
      return Response.json({ success: true })
    }
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
}

// Development-only reverse proxy. Batiok owns sign-in and the visitor machine.
export function createMockRemoteProxy(batiok: string, owner: string) {
  for (const origin of [batiok, owner]) {
    const url = new URL(origin)
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Mock upstreams must be local HTTP origins')
  }
  const cloud = createMockRemoteInvitations()
  const target = (path: string) => {
    const remote = /^\/api\/workspaces\/alice:owner-board(?=\/|\?|$)/
    return new URL(
      path.replace(remote, '/api/workspaces/owner-board'),
      remote.test(path) ? owner : batiok
    )
  }
  const forwardHeaders = (req: IncomingMessage, url: URL) => {
    const headers = { ...req.headers, host: url.host }
    const browserOrigin = `http://${req.headers.host}`
    // Translate only this proxy's origin. Foreign origins must still fail upstream checks.
    if (headers.origin === browserOrigin) headers.origin = new URL(batiok).origin
    if (headers.referer?.startsWith(`${browserOrigin}/`))
      headers.referer = new URL(batiok).origin + headers.referer.slice(browserOrigin.length)
    return headers
  }
  const server = createServer(async (req, res) => {
    const path = new URL(req.url!, 'http://localhost').pathname
    const sharing =
      /^\/cloud\/api\/workspaces\/alice:owner-board(\/(?:members|invitations)(?:\/[^/]+)?)$/.exec(
        path
      )
    const discovery = [
      '/cloud/api/workspaces/invitations',
      '/cloud/api/workspaces/shared',
      '/cloud/api/invitations/mock-owner-invite/accept'
    ].includes(path)
    try {
      if (discovery || sharing) {
        const session = await fetch(new URL('/cloud/api/auth/get-session', batiok), {
          headers: { cookie: req.headers.cookie ?? '' },
          redirect: 'manual'
        })
        if (!session.ok) throw new Error('Could not read the Batiok session')
        const identity = (await session.json()) as {
          user?: { id: string; name: string; email: string; isAnonymous: boolean }
        } | null
        if (!identity?.user || identity.user.isAnonymous) {
          res.writeHead(401, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Sign in required' }))
          return
        }
        const headers = new Headers({
          'x-moi-mock-viewer': encodeURIComponent(
            JSON.stringify({ ...identity.user, type: 'user' })
          )
        })
        const response = await cloud(
          new Request(
            `http://localhost${sharing ? `/mock/sharing${sharing[1]}` : `/mock${path}`}`,
            {
              method: req.method,
              headers,
              body: ['GET', 'HEAD'].includes(req.method!)
                ? undefined
                : (Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>)
            }
          )
        )
        res.writeHead(response.status, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'set-cookie': session.headers.getSetCookie()
        })
        res.end(await response.text())
        return
      }
      const url = target(req.url!)
      const upstream = httpRequest(
        url,
        { method: req.method, headers: forwardHeaders(req, url) },
        reply => {
          const headers = { ...reply.headers }
          if (headers.location) {
            const redirect = new URL(headers.location, url)
            if (redirect.origin === new URL(batiok).origin)
              headers.location = redirect.pathname + redirect.search + redirect.hash
          }
          res.writeHead(reply.statusCode!, headers)
          reply.pipe(res)
        }
      )
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502)
        res.end('Local upstream unavailable')
      })
      res.on('close', () => upstream.destroy())
      req.pipe(upstream)
    } catch {
      res.writeHead(502)
      res.end('Local upstream unavailable. Check Batiok and the mock owner')
    }
  })
  // Translate upgrade headers too, then tunnel bytes for collaboration and live updates.
  server.on('upgrade', (req, socket, head) => {
    const url = target(req.url!)
    const upstream = connect(Number(url.port || 80), url.hostname, () => {
      const headers = forwardHeaders(req, url)
      upstream.write(
        `${req.method} ${url.pathname}${url.search} HTTP/1.1\r\n` +
          Object.entries(headers)
            .flatMap(([key, value]) =>
              value === undefined
                ? []
                : (Array.isArray(value) ? value : [value]).map(item => `${key}: ${item}\r\n`)
            )
            .join('') +
          '\r\n'
      )
      upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
    socket.on('close', () => upstream.destroy())
    upstream.on('close', () => socket.destroy())
  })
  return server
}

if (import.meta.main) {
  const root = resolve(process.env.MOCK_OWNER_DATA_DIR ?? join(tmpdir(), 'moi-mock-owner'))
  // Set isolation before loading server modules, which capture DATA_DIR at import time.
  process.env.MOI_DATA_DIR = root
  process.env.MOI_SECRET_BACKEND = 'file'
  process.env.MOI_ENVIRONMENT = 'cloud'
  const { collabManager } = await import('../server/collab/manager')
  const { api } = await import('../server/api')
  const { registerWorkspace } = await import('../server/workspaces/registry')
  const { saveLayout, loadLayout } = await import('../server/workspaces/layout')
  const { buildAllViews } = await import('../server/applets/views')
  const { buildAllWidgets } = await import('../server/applets/widgets')
  const { createDefaultWorkspaceLayout } = await import('../lib/workspace-layout')
  const { killAllWorkers } = await import('../server/applets/functions')

  const owner = join(root, 'owner-board')
  await mkdir(join(owner, '.moi/views'), { recursive: true })
  await mkdir(join(owner, '.moi/widgets'), { recursive: true })
  await symlink(
    resolve(import.meta.dir, '../node_modules'),
    join(owner, '.moi/node_modules')
  ).catch(error => {
    if (error.code !== 'EEXIST') throw error
  })
  await registerWorkspace(owner, { id: 'owner-board', type: 'claude-code' })
  if (!(await Bun.file(join(owner, '.moi/.workspace.json')).exists()))
    await saveLayout(
      {
        ...createDefaultWorkspaceLayout(),
        name: 'Shared counter',
        widgetGrid: [...createDefaultWorkspaceLayout().widgetGrid, { i: 'counter', x: 0, y: 1 }],
        tabs: { open: ['overview', 'views/counter'], active: 'overview' }
      },
      owner
    )
  // Upgrade the original counter-only fixture without resetting personal settings or data.
  const layout = await loadLayout(owner)
  if (
    layout.widgetGrid.length === 1 &&
    layout.widgetGrid[0]?.i === 'counter' &&
    layout.widgetGrid[0].y === 0
  )
    await saveLayout(
      {
        ...layout,
        widgetGrid: [...createDefaultWorkspaceLayout().widgetGrid, { i: 'counter', x: 0, y: 1 }]
      },
      owner
    )

  const component = `import { useEffect, useState } from 'react'; import { read, increment } from './counter.server'; export const config = { title: 'Counter', colSpan: 1, rowSpan: 1 }; export default function Counter() { const [count, setCount] = useState(0); useEffect(() => { read().then(setCount) }, []); return <div className="p-4"><p>Owner count: {count}</p><button onClick={() => increment().then(setCount)}>Increment owner count</button></div> }`
  const functions = `import { join } from 'node:path'; const file = Bun.file(join(import.meta.dir, '../count.json')); export async function read() { return file.json().catch(() => 0) } export async function increment() { const next = (await read()) + 1; await Bun.write(file, JSON.stringify(next)); return next }`
  for (const kind of ['views', 'widgets']) {
    if (!(await Bun.file(join(owner, `.moi/${kind}/counter.tsx`)).exists()))
      await Bun.write(join(owner, `.moi/${kind}/counter.tsx`), component)
    if (!(await Bun.file(join(owner, `.moi/${kind}/counter.server.ts`)).exists()))
      await Bun.write(join(owner, `.moi/${kind}/counter.server.ts`), functions)
  }
  await buildAllViews(owner)
  await buildAllWidgets(owner)

  const ownerServer = Bun.serve({
    hostname: '127.0.0.1',
    port: Number(process.env.MOCK_OWNER_PORT ?? 13340),
    fetch: (request, server) => {
      const { pathname } = new URL(request.url)
      if (!/^\/api\/workspaces\/owner-board(?:\/|$)/.test(pathname)) {
        return new Response('Unknown mock owner or workspace', { status: 404 })
      }
      console.log(`OWNER ${request.method} ${pathname}`)
      if (pathname === '/api/workspaces/owner-board/collab') {
        if (server.upgrade(request)) return
        return new Response('WebSocket upgrade required', { status: 426 })
      }
      return api.fetch(request)
    },
    websocket: {
      open: socket => collabManager.open(socket, owner),
      message: (socket, message) => collabManager.message(socket, message),
      close: socket => collabManager.close(socket)
    }
  })
  const proxyPort = Number(process.env.MOCK_PROXY_PORT ?? 9898)
  const batiok = process.env.MOCK_BATIOK_ORIGIN ?? 'http://localhost:8787'
  const proxy = createMockRemoteProxy(batiok, ownerServer.url.origin)
  proxy.listen(proxyPort, '127.0.0.1', () => {
    console.log(`Open Moi at http://localhost:${proxyPort}`)
  })
  console.log(`Mock owner: ${ownerServer.url}; Batiok: ${batiok}`)
  const stop = async () => {
    await collabManager.shutdown()
    proxy.close()
    proxy.closeAllConnections()
    ownerServer.stop(true)
    killAllWorkers()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
