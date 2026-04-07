import type { ClientMessage } from '@/lib/types'

import index from '../client/index.html'
import { getMcpStatus, handleChat, stopChat } from './agent'
import { PORT } from './constants'
import './control'
import { callFunction } from './functions'
import { loadLayout, saveLayout } from './layout'
import { clients, cwd, getSessions, initState, messages, processing, switchSession } from './state'
import { listWidgets, serveWidget } from './widgets'

await initState()

const MEI_TOPIC = 'mei'

type WsData = { channel: 'chat' | 'mei' }

function isClientMessage(value: unknown): value is ClientMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    ((value.type === 'chat' && 'content' in value && typeof value.content === 'string') ||
      value.type === 'stop' ||
      (value.type === 'switch' && 'sessionId' in value))
  )
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
    '/': index,
    '/_mei/:workspaceId/widgets': () => listWidgets(),
    '/_mei/:workspaceId/widgets/*': req => {
      const name = new URL(req.url).pathname.split('/').pop()?.replace(/\.js$/, '')
      return name ? serveWidget(name) : new Response('Not found', { status: 404 })
    },
    '/_mei/:workspaceId/sessions': async () => Response.json(await getSessions()),
    '/_mei/:workspaceId/mcp': async () => Response.json(await getMcpStatus()),
    '/_mei/:workspaceId/layout': async req => {
      if (req.method === 'GET') return Response.json({ ...(await loadLayout()), cwd })
      if (req.method === 'PUT') {
        const body = await req.json()
        if (!body || body.version !== 1) return new Response('Bad request', { status: 400 })
        await saveLayout(body)
        return new Response(null, { status: 204 })
      }
      return new Response('Method not allowed', { status: 405 })
    },
    '/_mei/:workspaceId/fn/*': req => {
      if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
      const prefix = `/_mei/${req.params.workspaceId}/fn/`
      const tail = new URL(req.url).pathname.slice(prefix.length)
      return handleFunctionCall(req, tail)
    }
  },
  fetch(req, server) {
    const path = new URL(req.url).pathname
    if (path === '/ws') return upgrade(server, req, { channel: 'chat' })
    if (path === '/_mei/ws') return upgrade(server, req, { channel: 'mei' })
    return new Response('Not found', { status: 404 })
  },
  websocket: {
    open(ws) {
      if (ws.data.channel === 'chat') {
        clients.add(ws)
        ws.send(JSON.stringify({ type: 'history', messages }))
        ws.send(JSON.stringify({ type: 'status', processing }))
      } else {
        ws.subscribe(MEI_TOPIC)
      }
    },
    message(ws, message) {
      if (ws.data.channel !== 'chat') return
      try {
        const data = JSON.parse(String(message))
        if (!isClientMessage(data)) return
        if (data.type === 'chat' && data.content?.trim()) handleChat(data.content.trim())
        if (data.type === 'stop') stopChat()
        if (data.type === 'switch') switchSession(data.sessionId)
      } catch {}
    },
    close(ws) {
      if (ws.data.channel === 'chat') clients.delete(ws)
      else ws.unsubscribe(MEI_TOPIC)
    }
  }
})

async function handleFunctionCall(req: Request, tail: string): Promise<Response> {
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
    const result = await callFunction(module, name, args)
    return new Response(result, { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(message, { status: 500 })
  }
}

export function publishMei(msg: unknown) {
  app.publish(MEI_TOPIC, JSON.stringify(msg))
}
