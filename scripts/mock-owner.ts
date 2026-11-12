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
const { saveLayout } = await import('../server/workspaces/layout')
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
await registerWorkspace(owner, { id: 'owner-board' })
if (!(await Bun.file(join(owner, '.moi/.workspace.json')).exists()))
  await saveLayout(
    {
      ...createDefaultWorkspaceLayout(),
      name: 'Shared counter',
      widgetGrid: [{ i: 'counter', x: 0, y: 0 }],
      tabs: { open: ['overview', 'views/counter'], active: 'overview' }
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
