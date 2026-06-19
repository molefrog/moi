import type { ClientMessage } from '@/lib/types'

import index from '../client/index.html'
import { api } from './api'
import {
  getCCRunningSessions,
  interruptCCSession,
  killAllCCSessions,
  sendCCMessage
} from './cc-session'
import { PORT } from './constants'
import { control } from './control'
import { EVENTS_TOPIC, setEventServer } from './events'
import { killAllWorkers } from './functions'
import {
  abortOpenClawRun,
  getOpenClawRunningSessions,
  sendOpenClawMessage
} from './openclaw-session'
import { getWorkspace } from './registry'
import { addClient, removeClient, sendToClient } from './state'
import { distShell, prebuilt } from './static'

type WsData = { channel: 'chat' | 'events'; workspaceId: string }

function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  const v = value as {
    type: string
    workspaceId?: unknown
    sessionId?: unknown
    content?: unknown
    isNew?: unknown
    optimisticId?: unknown
    model?: unknown
    effort?: unknown
  }
  if (v.type === 'chat')
    return (
      typeof v.workspaceId === 'string' &&
      typeof v.content === 'string' &&
      typeof v.sessionId === 'string' &&
      typeof v.isNew === 'boolean' &&
      (v.optimisticId === undefined || typeof v.optimisticId === 'string') &&
      (v.model === undefined || typeof v.model === 'string') &&
      (v.effort === undefined || typeof v.effort === 'string')
    )
  if (v.type === 'stop') return typeof v.workspaceId === 'string' && typeof v.sessionId === 'string'
  return false
}

// The SPA shell: prebuilt index.html in prod (served statically), the
// live-bundled HTML import in dev (Bun.serve's bundler + HMR). The HTML import
// stays here, in the routes table, so Bun's dev bundler keys off it.
const shell = prebuilt ? distShell : index

type Upgradable = { upgrade(req: Request, opts: { data: WsData }): boolean }

function upgrade(server: Upgradable, req: Request, data: WsData) {
  return server.upgrade(req, { data })
    ? new Response(null, { status: 101 })
    : new Response('Upgrade failed', { status: 500 })
}

// Bun owns the fullstack surface: the HTML shell + dev bundler/HMR, and the two
// WebSocket channels (which need Bun's native `server.upgrade` + pub/sub). Every
// HTTP API route is delegated to the Hono app (`./api`) via `fetch`.
export const app = Bun.serve<WsData>({
  port: PORT,
  hostname: process.env.HOST ?? '127.0.0.1',
  // HMR only in dev; prod serves prebuilt static assets (no bundler).
  development: prebuilt ? false : { hmr: true },
  routes: {
    // Client-side routes — serve the SPA shell.
    '/': shell,
    '/playground': shell,
    '/playground/*': shell,
    '/workspace/*': shell,

    // Chat websocket — app-wide (one per client, not per workspace). Each chat
    // frame carries its own workspaceId.
    '/ws': (req, server) => upgrade(server, req, { channel: 'chat', workspaceId: '' }),

    // Live widget-event stream (build/refresh pushes). A static path, so Bun
    // routes it ahead of the Hono-served `/api/workspaces/:id`; the upgrade
    // happens in-handler via the route's `server` argument.
    '/api/workspaces/ws': (req, server) =>
      upgrade(server, req, { channel: 'events', workspaceId: '' })
  },
  // Anything not matched above (the whole HTTP API + prod static assets + 404)
  // is handled by Hono.
  fetch: req => api.fetch(req),
  websocket: {
    open(ws) {
      if (ws.data.channel === 'chat') {
        addClient(ws)
        // Authoritative snapshot of every running session (CC + OpenClaw) so the
        // client can light/clear spinners correctly even for runs whose status
        // transitions it missed while disconnected.
        const running = [...getCCRunningSessions(), ...getOpenClawRunningSessions()]
        sendToClient(ws, { type: 'status_snapshot', running })
      } else {
        ws.subscribe(EVENTS_TOPIC)
      }
    },
    async message(ws, message) {
      if (ws.data.channel !== 'chat') return
      try {
        const data = JSON.parse(String(message))
        if (!isClientMessage(data)) return

        if (data.type === 'chat' && data.content?.trim()) {
          const workspace = await getWorkspace(data.workspaceId)
          if (!workspace) return
          if (workspace.type === 'openclaw' && workspace.agentId) {
            sendOpenClawMessage({
              workspaceId: data.workspaceId,
              workspacePath: workspace.path,
              agentId: workspace.agentId,
              sessionId: data.sessionId,
              isNew: data.isNew,
              content: data.content.trim(),
              optimisticId: data.optimisticId
            })
          } else {
            sendCCMessage({
              workspaceId: data.workspaceId,
              workspacePath: workspace.path,
              sessionId: data.sessionId,
              isNew: data.isNew,
              content: data.content.trim(),
              optimisticId: data.optimisticId,
              model: data.model,
              effort: data.effort
            })
          }
        }
        if (data.type === 'stop') {
          const workspace = await getWorkspace(data.workspaceId)
          if (workspace?.type === 'openclaw') {
            abortOpenClawRun({ workspaceId: data.workspaceId, sessionId: data.sessionId })
          } else {
            interruptCCSession(data.workspaceId, data.sessionId)
          }
        }
      } catch {}
    },
    close(ws) {
      if (ws.data.channel === 'chat') removeClient(ws)
      else ws.unsubscribe(EVENTS_TOPIC)
    }
  }
})

// Wire the live-event publisher (`publishEvent`) to this server instance now
// that it exists. Kept in ./events so control.ts and ./api can publish without
// importing web.ts (which binds ports on load).
setEventServer(app)

// Graceful shutdown. In dev the supervisor sends SIGTERM on server-file
// changes; in any context Ctrl-C sends SIGINT. Close both servers and kill the
// per-workspace function workers so no child processes are orphaned.
function shutdown() {
  try {
    app.stop(true)
  } catch {}
  try {
    control.stop(true)
  } catch {}
  killAllCCSessions()
  killAllWorkers()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
