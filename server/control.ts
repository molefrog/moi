import { FONT_THEMES } from '@/lib/themes'

import { CONTROL_PORT } from './constants'
import { loadLayout, saveLayout } from './layout'
import { publishMei } from './web'
import { handleBundle } from './widgets'

export const control = Bun.serve({
  port: CONTROL_PORT,
  hostname: '127.0.0.1',
  fetch(req, server) {
    return server.upgrade(req)
      ? new Response(null, { status: 101 })
      : new Response('Control WebSocket only', { status: 426 })
  },
  websocket: {
    async message(ws, message) {
      try {
        const data = JSON.parse(String(message))

        if (data.type === 'bundle') {
          const results = await handleBundle(publishMei, !!data.force)
          ws.send(JSON.stringify(results))
          return
        }

        if (data.type === 'theme') {
          const layout = await loadLayout()
          if (!data.font) {
            ws.send(JSON.stringify({ currentFont: layout.theme?.font ?? 'system' }))
            return
          }
          if (!(data.font in FONT_THEMES)) {
            ws.send(JSON.stringify({ error: `Unknown font theme: ${data.font}` }))
            return
          }
          await saveLayout({ ...layout, theme: { font: data.font } })
          publishMei({ type: 'theme:updated' })
          ws.send(JSON.stringify({ ok: true, font: data.font }))
        }
      } catch {}
    }
  }
})
