import { getSessionMessages } from '@anthropic-ai/claude-agent-sdk'

import type { ClientMessage } from '@/lib/types'

import index from '../client/index.html'
import { getMcpStatus, handleChat, stopChat } from './agent'
import { PORT } from './constants'
import './control'
import { callFunction } from './functions'
import { loadLayout, saveLayout } from './layout'
import { discoverFromCC, getWorkspace, listWorkspaces, registerWorkspace } from './registry'
import {
  addClient,
  getProcessingSessions,
  getSessions,
  removeClient,
  sendToClient,
  transformMessage
} from './state'
import { listWidgets, serveWidget } from './widgets'

const MEI_TOPIC = 'mei'

type WsData = { channel: 'chat' | 'mei'; workspaceId: string }

function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  const v = value as { type: string; sessionId?: unknown; content?: unknown; isNew?: unknown }
  if (v.type === 'chat')
    return (
      typeof v.content === 'string' &&
      typeof v.sessionId === 'string' &&
      typeof v.isNew === 'boolean'
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
        const entry = await registerWorkspace(String(body.path))
        return Response.json(entry, { status: 201 })
      }
      return new Response('Method not allowed', { status: 405 })
    },
    '/api/workspaces/discover': async () => Response.json(await discoverFromCC()),

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
      return Response.json(await getSessions(ws.path))
    },
    '/_mei/:workspaceId/sessions/:sessionId/messages': async req => {
      const ws = await getWorkspace(req.params.workspaceId)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      const sid = req.params.sessionId
      try {
        const raw = await getSessionMessages(sid, { dir: ws.path })
        return Response.json(raw.flatMap(transformMessage))
      } catch {
        return Response.json([])
      }
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
        for (const sid of getProcessingSessions(ws.data.workspaceId)) {
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
          handleChat(
            data.content.trim(),
            data.sessionId,
            data.isNew,
            ws.data.workspaceId,
            workspace.path
          )
        }
        if (data.type === 'stop') {
          stopChat(data.sessionId, ws.data.workspaceId)
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
