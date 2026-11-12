// Mock owner for the local Batiok gateway at localhost:8787.
import { mkdir, symlink } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(process.env.MOCK_OWNER_DATA_DIR ?? join(tmpdir(), 'moi-mock-owner'))
// Set isolation before loading server modules, which capture DATA_DIR at import time.
process.env.MOI_DATA_DIR = root
process.env.MOI_SECRET_BACKEND = 'file'
process.env.MOI_ENVIRONMENT = 'cloud'
const { collabManager } = await import('../server/collab/manager')
const { api } = await import('../server/api')
const { registerWorkspace } = await import('../server/workspaces/registry')
const { installWorkspaceSkills } = await import('../server/skills/workspace')
const { saveLayout, loadLayout } = await import('../server/workspaces/layout')
const { buildAllViews } = await import('../server/applets/views')
const { buildAllWidgets } = await import('../server/applets/widgets')
const { createDefaultWorkspaceLayout } = await import('../lib/workspace-layout')
const { killAllWorkers } = await import('../server/applets/functions')

const owner = join(root, 'owner-board')
const visitor = resolve(process.env.MOCK_VISITOR_DIR ?? join(homedir(), 'moi', 'shared-counter'))
await mkdir(join(owner, '.moi/views'), { recursive: true })
await mkdir(join(owner, '.moi/widgets'), { recursive: true })
await mkdir(join(visitor, '.moi'), { recursive: true })
await symlink(resolve(import.meta.dir, '../node_modules'), join(owner, '.moi/node_modules')).catch(
  error => {
    if (error.code !== 'EEXIST') throw error
  }
)
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

if (!(await Bun.file(join(visitor, '.moi/.workspace.json')).exists()))
  await Bun.write(
    join(visitor, '.moi/.workspace.json'),
    JSON.stringify({
      version: 2,
      remote: { user_id: 'alice', workspace_id: 'owner-board' },
      layoutMode: 'split',
      selectedModel: 'sonnet'
    })
  )
await installWorkspaceSkills(visitor, 'codex')
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
// Local-only sharing fixture. Invitations never send email; membership resets on restart.
type MockMember = {
  id: string
  type: 'user'
  name: string
  email: string
  isAnonymous: boolean
  membershipId?: string
}
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
const knownVisitors = new Set<string>()
const invitations: { id: string; email: string; expiresAt: string }[] = []
async function sharing(request: Request, suffix: string): Promise<Response> {
  const viewerHeader = request.headers.get('x-moi-mock-viewer')
  if (!viewerHeader) return Response.json({ error: 'Sign in required' }, { status: 401 })
  const viewer = JSON.parse(decodeURIComponent(viewerHeader)) as MockMember
  if (!knownVisitors.has(viewer.id)) {
    knownVisitors.add(viewer.id)
    if (!members.some(member => member.id === viewer.id))
      members.push({ ...viewer, membershipId: `member-${viewer.id}` })
  }
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

const ownerServer = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.MOCK_OWNER_PORT ?? 13340),
  fetch: (request, server) => {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/mock/sharing/'))
      return sharing(request, pathname.slice('/mock/sharing'.length))
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
console.log(`Mock owner: ${ownerServer.url}`)
console.log(`Batiok .dev.vars: MOCK_REMOTE_ORIGIN=${ownerServer.url.origin}`)
console.log('Open Moi at http://localhost:8787')
console.log(`Add this folder once: ${visitor}`)
console.log(`Existing references to alice/owner-board also work`)
console.log(`Owner counter: ${join(owner, '.moi/count.json')}`)
const stop = async () => {
  await collabManager.shutdown()
  ownerServer.stop(true)
  killAllWorkers()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
