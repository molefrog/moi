import { watch } from 'node:fs'
import { join } from 'path'

import { CONTROL_PORT } from './constants'
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
        if (data.type !== 'bundle') return

        const results = await handleBundle(publishMei)
        ws.send(JSON.stringify(results))
      } catch {}
    }
  }
})

// Auto-bundle when widget source files change
const MEI_DIR = join(import.meta.dir, '..', 'workspace', 'mei')
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let bundling = false

watch(MEI_DIR, (event, filename) => {
  if (!filename) return
  if (!(/\.(tsx|ts)$/.test(filename) && !filename.endsWith('.server.ts'))) return
  if (filename.startsWith('.build')) return

  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(async () => {
    if (bundling) return
    bundling = true
    try {
      await handleBundle(publishMei)
    } finally {
      bundling = false
    }
  }, 300)
})
