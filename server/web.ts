import type { ClientMessage } from '@/lib/types'

import index from '../client/index.html'
import { handleChat, stopChat } from './agent'
import { PORT } from './constants'
import { clients, messages, processing } from './state'
import { listWidgets, serveWidget } from './widgets'

const MEI_TOPIC = 'mei'

type WsData = { channel: 'chat' | 'mei' }

function isClientMessage(value: unknown): value is ClientMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    ((value.type === 'chat' && 'content' in value && typeof value.content === 'string') ||
      value.type === 'stop')
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
  routes: {
    '/': index,
    '/_mei/widgets': () => listWidgets(),
    '/_mei/widgets/*': (req) => {
      const name = new URL(req.url).pathname.split('/').pop()?.replace(/\.js$/, '')
      return name ? serveWidget(name) : new Response('Not found', { status: 404 })
    },
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
      } catch {}
    },
    close(ws) {
      if (ws.data.channel === 'chat') clients.delete(ws)
      else ws.unsubscribe(MEI_TOPIC)
    },
  },
})

export function publishMei(msg: unknown) {
  app.publish(MEI_TOPIC, JSON.stringify(msg))
}

import './control'
