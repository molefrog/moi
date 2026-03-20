import { CONTROL_PORT } from './constants'
import { publishMei } from './web'
import { handleBundle } from './widgets'

export const control = Bun.serve({
  port: CONTROL_PORT,
  fetch(req, server) {
    return server.upgrade(req)
      ? new Response(null, { status: 101 })
      : new Response('Control WebSocket only', { status: 426 })
  },
  websocket: {
    async message(ws, message) {
      try {
        const data = JSON.parse(String(message))
        if (data.type !== 'bundle') return

        const results = await handleBundle(publishMei)
        ws.send(JSON.stringify(results))
      } catch {}
    },
  },
})
