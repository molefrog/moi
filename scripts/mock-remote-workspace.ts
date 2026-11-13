// Local remote-workspace fixture and browser proxy.
import { mkdir, rm, symlink } from 'node:fs/promises'
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
                workspaceName: 'Product launch',
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
                name: 'Product launch',
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

  const tasks = [
    {
      id: 'positioning',
      title: 'Agree on the launch story',
      owner: 'Alice',
      area: 'Messaging',
      done: true
    },
    {
      id: 'landing',
      title: 'Review the landing page',
      owner: 'Jamie',
      area: 'Website',
      done: false
    },
    {
      id: 'demo',
      title: 'Record the two-minute demo',
      owner: 'Alice',
      area: 'Content',
      done: false
    },
    {
      id: 'email',
      title: 'Write the customer announcement',
      owner: 'Sam',
      area: 'Messaging',
      done: true
    },
    { id: 'qa', title: 'Test signup on mobile', owner: 'Jamie', area: 'Quality', done: false },
    { id: 'support', title: 'Prepare support answers', owner: 'Sam', area: 'Support', done: false }
  ]
  const data = Bun.file(join(owner, '.moi/launch-tasks.json'))
  if (!(await data.exists())) await Bun.write(data, JSON.stringify(tasks, null, 2))
  const functions = `
const file = () => Bun.file('.moi/launch-tasks.json');
type Task = { id: string; title: string; owner: string; area: string; done: boolean };
export async function read(): Promise<Task[]> { return file().json(); }
export async function setDone(id: string, done: boolean) {
  const tasks = await read();
  const task = tasks.find(task => task.id === id);
  if (!task || typeof done !== 'boolean') throw new Error('Invalid task');
  task.done = done;
  await Bun.write(file(), JSON.stringify(tasks, null, 2));
  return tasks;
}`
  const checklist = (view: boolean) => `
import { useEffect, useState } from 'react';
import { read, setDone } from './${view ? 'launch-plan' : 'launch-progress'}.server';
export const config = ${view ? "{ title: 'Launch plan', icon: 'rocket' }" : '{ colSpan: 2, rowSpan: 2 }'};
export default function LaunchPlan() {
  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof read>>>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { read().then(setTasks).catch(error => setError(error.message)); }, []);
  const completed = tasks.filter(task => task.done).length;
  async function update(id: string, done: boolean) {
    setBusy(true); setError('');
    try { setTasks(await setDone(id, done)); } catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  }
  return <div className="h-full w-full overflow-auto bg-background text-foreground ${view ? 'p-6 sm:p-10' : 'p-5'}">
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">${view ? 'Product launch / Team checklist' : 'Launch readiness'}</p>
      <h1 className="mt-3 ${view ? 'text-3xl' : 'text-2xl'} font-medium">${view ? 'A clear path to launch' : '{completed} / {tasks.length} ready'}</h1>
      <p className="mt-2 text-sm text-muted-foreground">${view ? 'Finish the essentials together. Tick off an item when it is ready to ship.' : 'The essentials before we go live.'}</p>
      <progress aria-label="Launch readiness" className="my-4 h-2 w-full accent-emerald-600" value={completed} max={tasks.length || 1} />
      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
      {!tasks.length && !error && <p className="text-sm text-muted-foreground">Loading launch plan…</p>}
      <div className="space-y-4">{${view ? 'tasks' : 'tasks.filter(task => !task.done).slice(0, 3)'}.map(task =>
        <label key={task.id} className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1 size-4 accent-emerald-600" checked={task.done} disabled={busy} onChange={event => void update(task.id, event.target.checked)} />
          <span><span className={task.done ? 'text-sm text-muted-foreground line-through' : 'text-sm font-medium'}>{task.title}</span>
          <span className="mt-1 block text-xs text-muted-foreground">{task.owner} · {task.area}</span></span>
        </label>)}</div>
      ${view ? '' : '<p className="mt-4 text-xs text-muted-foreground">Full checklist in the Launch plan view.</p>'}
    </div>
  </div>;
}`
  const brief = `
export const config = { colSpan: 2, rowSpan: 2 };
export default function LaunchBrief() {
  return <div className="h-full w-full overflow-auto bg-emerald-50 p-5 text-emerald-950">
    <p className="text-xs font-medium uppercase tracking-widest text-emerald-700">Launch brief</p>
    <h2 className="mt-4 text-2xl font-medium">Ready for the first hello.</h2>
    <p className="mt-3 text-sm leading-relaxed">Introduce our new team workspace to the first 50 customers. Keep the story clear and the first session effortless.</p>
    <dl className="mt-6 space-y-3 text-sm">
      <div className="flex justify-between gap-3"><dt className="text-emerald-700">Stage</dt><dd>Private beta</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-emerald-700">Launch lead</dt><dd>Alice</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-emerald-700">Next milestone</dt><dd>Team review</dd></div>
    </dl>
  </div>;
}`
  for (const [path, source] of Object.entries({
    'widgets/launch-brief.tsx': brief,
    'widgets/launch-progress.tsx': checklist(false),
    'widgets/launch-progress.server.ts': functions,
    'views/launch-plan.tsx': checklist(true),
    'views/launch-plan.server.ts': functions
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
