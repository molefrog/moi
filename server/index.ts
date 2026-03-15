import type { ClientMessage } from '@/lib/types'

import index from '../client/index.html'
import { handleChat, stopChat } from './agent'
import { clients, messages, processing } from './state'

function isClientMessage(value: unknown): value is ClientMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    ((value.type === 'chat' && 'content' in value && typeof value.content === 'string') ||
      value.type === 'stop')
  )
}

Bun.serve({
  port: 3000,
  routes: {
    '/': index
  },
  fetch(req, server) {
    const url = new URL(req.url)
    if (url.pathname === '/ws') {
      if (server.upgrade(req)) return new Response(null, { status: 101 })
      return new Response('Upgrade failed', { status: 500 })
    }
    return new Response('Not found', { status: 404 })
  },
  websocket: {
    open(ws) {
      clients.add(ws)
      ws.send(JSON.stringify({ type: 'history', messages }))
      ws.send(JSON.stringify({ type: 'status', processing }))
    },
    message(ws, message) {
      try {
        const data = JSON.parse(String(message))
        if (!isClientMessage(data)) return
        if (data.type === 'chat' && data.content?.trim()) {
          handleChat(data.content.trim())
        }
        if (data.type === 'stop') {
          stopChat()
        }
      } catch {}
    },
    close(ws) {
      clients.delete(ws)
    }
  }
})

console.log('Agent chat running at http://localhost:3000')
