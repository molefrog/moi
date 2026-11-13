// Local remote-workspace fixture and browser proxy.
import { lstat, mkdir, readdir, readlink, rename, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { createServer, request as httpRequest, type IncomingMessage } from 'node:http'
import { connect } from 'node:net'
import { Readable } from 'node:stream'
import envPaths from 'env-paths'

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
        invitations: members.some(member => member.id === viewer.id)
          ? []
          : [
              {
                id: 'mock-owner-invite',
                workspaceName: 'Product launch',
                inviter: { name: 'Alice' }
              }
            ]
      })
    if (
      path === '/mock/cloud/api/invitations/mock-owner-invite/accept' &&
      request.method === 'POST'
    ) {
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
        workspaces: members.some(member => member.id === viewer.id)
          ? [
              {
                id: 'owner-board',
                name: 'Product launch',
                owner: { id: 'alice', name: 'Alice' }
              }
            ]
          : []
      })
    if (!members.some(member => member.id === viewer.id))
      return Response.json(
        { error: 'Workspace not available', code: 'WORKSPACE_NOT_AVAILABLE' },
        { status: 404 }
      )
    if (path === '/mock/access') return new Response(null, { status: 204 })
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
  const remote = /^\/api\/workspaces\/alice:owner-board(?=\/|\?|$)/
  const target = (path: string) => {
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
  const authorize = async (req: IncomingMessage) => {
    const origin = req.headers.origin
    if (
      (origin && origin !== `http://${req.headers.host}`) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    )
      return { response: Response.json({ error: 'Invalid origin' }, { status: 403 }) }
    const session = await fetch(new URL('/cloud/api/auth/get-session', batiok), {
      headers: { cookie: req.headers.cookie ?? '' },
      redirect: 'manual'
    })
    if (!session.ok) throw new Error('Could not read the Batiok session')
    const identity = (await session.json()) as { user?: MockMember } | null
    if (!identity?.user || identity.user.isAnonymous)
      return { response: Response.json({ error: 'Sign in required' }, { status: 401 }) }
    const headers = new Headers({
      'x-moi-mock-viewer': encodeURIComponent(JSON.stringify({ ...identity.user, type: 'user' }))
    })
    return { headers, session }
  }
  const ownerAccess = async (req: IncomingMessage) => {
    const auth = await authorize(req)
    return (
      auth.response ?? cloud(new Request('http://localhost/mock/access', { headers: auth.headers }))
    )
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
        const auth = await authorize(req)
        if (auth.response) {
          res.writeHead(auth.response.status, { 'content-type': 'application/json' })
          res.end(await auth.response.text())
          return
        }
        const { headers, session } = auth
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
      if (remote.test(req.url!)) {
        const access = await ownerAccess(req)
        if (!access.ok) {
          res.writeHead(access.status, { 'content-type': 'application/json' })
          res.end(await access.text())
          return
        }
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
  server.on('upgrade', async (req, socket, head) => {
    try {
      if (remote.test(req.url!)) {
        const access = await ownerAccess(req)
        if (!access.ok) {
          socket.end(
            `HTTP/1.1 ${access.status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`
          )
          return
        }
      }
    } catch {
      socket.destroy()
      return
    }
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

// The API deliberately blocks remote removal. Reset only this local fixture's registry entry.
export async function resetMockRegistration(
  visitorOrigin: string,
  registryPath = join(
    process.env.MOI_DATA_DIR || envPaths('moi', { suffix: '' }).data,
    'workspaces.json'
  )
) {
  const url = new URL(visitorOrigin)
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Mock visitor must be a local HTTP origin')
  const response = await fetch(new URL('/api/workspaces', url))
  if (!response.ok) throw new Error('Could not list visitor workspaces; start Moi first')
  const entries = (await response.json()) as {
    id: string
    path: string
    remote?: { user_id: string; workspace_id: string }
  }[]
  const hash = new Bun.CryptoHasher('sha256')
    .update(JSON.stringify(['alice', 'owner-board']))
    .digest('hex')
    .slice(0, 12)
  const generatedName = `shared-owner-board-${hash}`
  for (const entry of entries) {
    if (entry.remote?.user_id !== 'alice' || entry.remote.workspace_id !== 'owner-board') continue
    const registry = (await Bun.file(registryPath).json()) as { id: string; path: string }[]
    if (!registry.some(item => item.id === entry.id && item.path === entry.path))
      throw new Error(
        `Mock workspace ${entry.id} does not match the local registry; check MOI_DATA_DIR`
      )
    const temporary = `${registryPath}.${crypto.randomUUID()}.tmp`
    try {
      await Bun.write(
        temporary,
        JSON.stringify(
          registry.filter(item => item.id !== entry.id),
          null,
          2
        )
      )
      await rename(temporary, registryPath)
    } finally {
      await rm(temporary, { force: true })
    }
    if (basename(entry.path) === generatedName && (await isGeneratedReference(entry.path))) {
      await rm(entry.path, { recursive: true })
      console.log(`Reset mock reference: ${entry.path}`)
    } else console.log(`Unregistered mock; preserved folder: ${entry.path}`)
  }
}

async function isGeneratedReference(root: string): Promise<boolean> {
  try {
    if (!(await lstat(root)).isDirectory()) return false
    const config = await Bun.file(join(root, '.moi/.workspace.json')).json()
    if (
      config.version !== 2 ||
      config.remote?.user_id !== 'alice' ||
      config.remote?.workspace_id !== 'owner-board' ||
      Object.keys(config).some(key => !['version', 'remote'].includes(key)) ||
      Object.keys(config.remote).some(key => !['user_id', 'workspace_id'].includes(key))
    )
      return false
    const parents = new Set(['', '.moi', '.agents', '.agents/skills', '.claude', '.claude/skills'])
    const skill = '.agents/skills/moi-workspace'
    async function check(path: string): Promise<boolean> {
      const full = join(root, path)
      const stat = await lstat(full)
      if (path === '.claude/skills/moi-workspace')
        return (
          stat.isSymbolicLink() && (await readlink(full)) === '../../.agents/skills/moi-workspace'
        )
      if (stat.isSymbolicLink()) return false
      if (path === '.moi/.workspace.json') return stat.isFile()
      if (parents.has(path)) {
        if (!stat.isDirectory()) return false
      } else if (path === skill || path.startsWith(skill + '/')) {
        const source = join(import.meta.dir, '../skill', path.slice(skill.length))
        const original = await lstat(source)
        if (stat.isFile())
          return (
            original.isFile() &&
            Buffer.from(await Bun.file(full).arrayBuffer()).equals(
              Buffer.from(await Bun.file(source).arrayBuffer())
            )
          )
        if (!stat.isDirectory() || !original.isDirectory()) return false
      } else return false
      for (const name of await readdir(full))
        if (!(await check(path ? `${path}/${name}` : name))) return false
      return true
    }
    return await check('')
  } catch {
    return false
  }
}

if (import.meta.main) {
  const root = resolve(process.env.MOCK_OWNER_DATA_DIR ?? join(tmpdir(), 'moi-mock-owner'))
  await resetMockRegistration(process.env.MOCK_VISITOR_ORIGIN ?? 'http://localhost:13337')
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
  const layout = await loadLayout(owner)
  if (!layout.name || layout.name === 'Shared counter') {
    await saveLayout(
      {
        ...layout,
        name: 'Product launch',
        widgetGrid: [
          ...createDefaultWorkspaceLayout().widgetGrid,
          { i: 'launch-brief', x: 0, y: 1 },
          { i: 'launch-progress', x: 2, y: 1 }
        ],
        tabs: { open: ['overview', 'views/launch-plan'], active: 'overview' }
      },
      owner
    )
  }
  // Retire only the original generated applets; keep their saved counter data.
  for (const kind of ['views', 'widgets'])
    for (const suffix of ['tsx', 'server.ts'])
      await rm(join(owner, `.moi/${kind}/counter.${suffix}`), { force: true })

  const brief = `
export const config = { colSpan: 2, rowSpan: 1 };
export default function LaunchBrief() {
  return <div className="h-full w-full bg-background p-4 text-foreground">
    <h2 className="text-sm font-medium">Launch brief</h2>
    <p className="mt-3 text-sm">A private beta for our first 50 customers.</p>
    <p className="mt-2 text-xs text-muted-foreground">Alice · Team review this week</p>
  </div>;
}`
  const progress = `
export const config = { colSpan: 2, rowSpan: 1 };
export default function LaunchProgress() {
  return <div className="h-full w-full bg-background p-4 text-foreground">
    <h2 className="text-sm font-medium">Launch readiness</h2>
    <p className="mt-3 text-2xl font-medium">2 of 6 ready</p>
    <p className="mt-2 text-xs text-muted-foreground">Next: review the landing page</p>
  </div>;
}`
  const plan = `
export const config = { title: 'Launch plan', icon: 'rocket' };
export default function LaunchPlan() {
  return <div className="h-full w-full overflow-auto bg-background p-6 text-foreground">
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-medium">Launch plan</h1>
      <p className="mt-2 text-sm text-muted-foreground">The essentials for our private beta.</p>
      <ul className="mt-6 divide-y divide-border">
        {[
          ['Launch story', 'Alice', 'Ready'],
          ['Landing page', 'Jamie', 'In review'],
          ['Product demo', 'Alice', 'To do'],
          ['Customer email', 'Sam', 'Ready'],
          ['Mobile signup', 'Jamie', 'To do'],
          ['Support answers', 'Sam', 'To do']
        ].map(([task, owner, status]) => <li key={task} className="flex items-center gap-4 py-3 text-sm">
          <span className="min-w-0 flex-1">{task}<span className="mt-1 block text-xs text-muted-foreground">{owner}</span></span>
          <span className="shrink-0 text-xs text-muted-foreground">{status}</span>
        </li>)}
      </ul>
    </div>
  </div>;
}`
  // These applets are static fixtures. Leave any saved owner data untouched.
  for (const path of ['widgets/launch-progress.server.ts', 'views/launch-plan.server.ts'])
    await rm(join(owner, '.moi', path), { force: true })
  for (const [path, source] of Object.entries({
    'widgets/launch-brief.tsx': brief,
    'widgets/launch-progress.tsx': progress,
    'views/launch-plan.tsx': plan
  }))
    await Bun.write(join(owner, '.moi', path), source)
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
