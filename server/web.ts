import type { ClientMessage } from '@/lib/types'

import index from '../client/index.html'
import { getMcpStatus, handleChat, stopChat } from './agent'
import { PORT } from './constants'
import './control'
import { callFunction } from './functions'
import { loadLayout, saveLayout } from './layout'
import { getOpenClawSessionMessages, getOpenClawSessions } from './openclaw'
import { toSessionInfo, toStreamEvents } from './openclaw-adapter'
import {
  abortOpenClawRun,
  ensureOpenClawSessionLive,
  getLiveOpenClawEvents,
  getOpenClawProcessingSessions,
  sendOpenClawMessage
} from './openclaw-session'
import {
  discoverWorkspaces,
  getWorkspace,
  listWorkspaces,
  registerWorkspace,
  removeWorkspace
} from './registry'
import {
  addClient,
  getProcessingSessions,
  getSessionEvents,
  getSessions,
  removeClient,
  sendToClient
} from './state'
import { listWidgets, serveWidget } from './widgets'

const MEI_TOPIC = 'mei'

type WsData = { channel: 'chat' | 'mei'; workspaceId: string }

function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  const v = value as {
    type: string
    sessionId?: unknown
    content?: unknown
    isNew?: unknown
    optimisticId?: unknown
  }
  if (v.type === 'chat')
    return (
      typeof v.content === 'string' &&
      typeof v.sessionId === 'string' &&
      typeof v.isNew === 'boolean' &&
      (v.optimisticId === undefined || typeof v.optimisticId === 'string')
    )
  if (v.type === 'stop') return typeof v.sessionId === 'string'
  return false
}

type Upgradable = { upgrade(req: Request, opts: { data: WsData }): boolean }

function upgrade(server: Upgradable, req: Request, data: WsData) {
  return server.upgrade(req, { data })
    ? new Response(null, { status: 101 })
    : new Response('Upgrade failed', { status: 500 })
}

export const app = Bun.serve<WsData>({
  port: PORT,
  hostname: process.env.HOST ?? '127.0.0.1',
  development: { hmr: true },
  routes: {
    // Client-side routes — serve the SPA shell
    '/': index,
    '/workspace/*': index,

    // Workspace registry API
    '/api/workspaces': async req => {
      if (req.method === 'GET') return Response.json(await listWorkspaces())
      if (req.method === 'POST') {
        const body = await req.json()
        if (!body?.path) return new Response('Missing path', { status: 400 })
        const rawType = body?.type
        const type = rawType === 'claude-code' || rawType === 'openclaw' ? rawType : undefined
        const entry = await registerWorkspace(String(body.path), {
          type,
          name: typeof body?.name === 'string' ? body.name : undefined,
          agentId: typeof body?.agentId === 'string' ? body.agentId : undefined,
          isDefault: typeof body?.isDefault === 'boolean' ? body.isDefault : undefined,
          lastRunAt: typeof body?.lastRunAt === 'string' ? body.lastRunAt : undefined
        })
        return Response.json(entry, { status: 201 })
      }
      return new Response('Method not allowed', { status: 405 })
    },
    '/api/workspaces/discover': async () => Response.json(await discoverWorkspaces()),
    '/api/workspaces/:id': async req => {
      if (req.method === 'DELETE') {
        const ok = await removeWorkspace(req.params.id)
        if (!ok) return new Response('Workspace not found', { status: 404 })
        return new Response(null, { status: 204 })
      }
      return new Response('Method not allowed', { status: 405 })
    },

    // Per-workspace MEI API
    '/_mei/:workspaceId/widgets': async req => {
      const ws = await getWorkspace(req.params.workspaceId)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      return listWidgets(ws.path)
    },
    '/_mei/:workspaceId/widgets/*': async req => {
      const ws = await getWorkspace(req.params.workspaceId)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      const name = new URL(req.url).pathname.split('/').pop()?.replace(/\.js$/, '')
      return name ? serveWidget(name, ws.path) : new Response('Not found', { status: 404 })
    },
    '/_mei/:workspaceId/sessions': async req => {
      const ws = await getWorkspace(req.params.workspaceId)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      if (ws.type === 'openclaw') {
        const rows = await getOpenClawSessions(ws.path, ws.agentId)
        return Response.json(rows.map(r => toSessionInfo(r, ws.path)))
      }
      return Response.json(await getSessions(ws.path))
    },
    '/_mei/:workspaceId/sessions/:sessionId/events': async req => {
      const ws = await getWorkspace(req.params.workspaceId)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      if (ws.type === 'openclaw') {
        // Prefer the live view if we already hold one — keeps REST + WS in
        // agreement for any reload that lands while a run is active. The
        // first cold call also primes the live subscription so subsequent
        // WS frames upsert into the same view.
        const live = getLiveOpenClawEvents(req.params.workspaceId, req.params.sessionId)
        if (live) return Response.json(live)
        if (ws.agentId) {
          try {
            const evs = await ensureOpenClawSessionLive({
              workspaceId: req.params.workspaceId,
              workspacePath: ws.path,
              agentId: ws.agentId,
              sessionId: req.params.sessionId
            })
            return Response.json(evs)
          } catch {
            // fall through to static path
          }
        }
        const preview = await getOpenClawSessionMessages(req.params.sessionId, ws.path, ws.agentId)
        return Response.json(toStreamEvents(preview))
      }
      return Response.json(await getSessionEvents(req.params.sessionId, ws.path))
    },
    '/_mei/:workspaceId/mcp': async req => {
      const ws = await getWorkspace(req.params.workspaceId)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      return Response.json(await getMcpStatus(ws.path))
    },
    '/_mei/:workspaceId/layout': async req => {
      const ws = await getWorkspace(req.params.workspaceId)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      if (req.method === 'GET') {
        return Response.json({ ...(await loadLayout(ws.path)), cwd: ws.path })
      }
      if (req.method === 'PUT') {
        const body = await req.json()
        if (!body || body.version !== 1) return new Response('Bad request', { status: 400 })
        await saveLayout(body, ws.path)
        return new Response(null, { status: 204 })
      }
      return new Response('Method not allowed', { status: 405 })
    },
    '/_mei/:workspaceId/fn/*': async req => {
      if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
      const ws = await getWorkspace(req.params.workspaceId)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      const prefix = `/_mei/${req.params.workspaceId}/fn/`
      const tail = new URL(req.url).pathname.slice(prefix.length)
      return handleFunctionCall(req, tail, ws.path)
    }
  },
  fetch(req, server) {
    const url = new URL(req.url)
    if (url.pathname === '/ws') {
      const workspaceId = url.searchParams.get('workspace') ?? ''
      return upgrade(server, req, { channel: 'chat', workspaceId })
    }
    if (url.pathname === '/_mei/ws') {
      return upgrade(server, req, { channel: 'mei', workspaceId: '' })
    }
    return new Response('Not found', { status: 404 })
  },
  websocket: {
    open(ws) {
      if (ws.data.channel === 'chat') {
        addClient(ws.data.workspaceId, ws)
        const seen = new Set<string>()
        for (const sid of getProcessingSessions(ws.data.workspaceId)) {
          seen.add(sid)
          sendToClient(ws, { type: 'status', sessionId: sid, processing: true })
        }
        for (const sid of getOpenClawProcessingSessions(ws.data.workspaceId)) {
          if (seen.has(sid)) continue
          sendToClient(ws, { type: 'status', sessionId: sid, processing: true })
        }
      } else {
        ws.subscribe(MEI_TOPIC)
      }
    },
    async message(ws, message) {
      if (ws.data.channel !== 'chat') return
      try {
        const data = JSON.parse(String(message))
        if (!isClientMessage(data)) return

        if (data.type === 'chat' && data.content?.trim()) {
          const workspace = await getWorkspace(ws.data.workspaceId)
          if (!workspace) return
          if (workspace.type === 'openclaw' && workspace.agentId) {
            sendOpenClawMessage({
              workspaceId: ws.data.workspaceId,
              workspacePath: workspace.path,
              agentId: workspace.agentId,
              sessionId: data.sessionId,
              isNew: data.isNew,
              content: data.content.trim(),
              optimisticId: data.optimisticId
            })
          } else {
            handleChat(
              data.content.trim(),
              data.sessionId,
              data.isNew,
              ws.data.workspaceId,
              workspace.path,
              data.optimisticId
            )
          }
        }
        if (data.type === 'stop') {
          const workspace = await getWorkspace(ws.data.workspaceId)
          if (workspace?.type === 'openclaw') {
            abortOpenClawRun({ workspaceId: ws.data.workspaceId, sessionId: data.sessionId })
          } else {
            stopChat(data.sessionId, ws.data.workspaceId)
          }
        }
      } catch {}
    },
    close(ws) {
      if (ws.data.channel === 'chat') removeClient(ws.data.workspaceId, ws)
      else ws.unsubscribe(MEI_TOPIC)
    }
  }
})

async function handleFunctionCall(
  req: Request,
  tail: string,
  workspacePath: string
): Promise<Response> {
  const parts = tail.split('/')
  if (parts.length !== 2) return new Response('Bad request', { status: 400 })

  const [module, name] = parts
  if (!/^[a-zA-Z0-9_$-]+$/.test(module) || !/^[a-zA-Z0-9_$]+$/.test(name)) {
    return new Response('Invalid module or function name', { status: 400 })
  }

  try {
    const contentLength = Number(req.headers.get('content-length') ?? 0)
    if (contentLength > 1_000_000) {
      return new Response('Request body too large', { status: 413 })
    }
    const args = await req.text()
    const result = await callFunction(module, name, args, workspacePath)
    return new Response(result, { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(message, { status: 500 })
  }
}

export function publishMei(msg: unknown) {
  app.publish(MEI_TOPIC, JSON.stringify(msg))
}

// Dev-only: broadcast a reload signal on every module re-exec so the browser
// refreshes after `bun --hot` reloads server code. Fires on first boot too,
// with no subscribers — which is a no-op.
if (process.env.MOI_DEV === '1') {
  publishMei({ type: 'dev:reload' })
}
