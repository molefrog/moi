import { resolve } from 'path'

import { FONT_THEMES } from '@/lib/themes'

import { CONTROL_PORT } from './constants'
import { loadLayout, saveLayout } from './layout'
import { listWorkspaces, registerWorkspace } from './registry'
import { broadcastAll } from './state'
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

        if (data.type === 'workspace:register') {
          const absPath = resolve(String(data.path))
          const entry = await registerWorkspace(absPath)
          broadcastAll({ type: 'workspace:switch', workspaceId: entry.id })
          ws.send(JSON.stringify({ id: entry.id, path: entry.path }))
          return
        }

        if (data.type === 'workspace:list') {
          const workspaces = await listWorkspaces()
          ws.send(JSON.stringify({ workspaces }))
          return
        }

        if (data.type === 'bundle') {
          // Bundle needs a workspace path — default to first registered workspace
          const workspaces = await listWorkspaces()
          if (workspaces.length === 0) {
            ws.send(JSON.stringify({ error: 'No workspaces registered' }))
            return
          }
          const workspacePath = String(data.path ?? workspaces[0].path)
          const results = await handleBundle(publishMei, workspacePath, !!data.force)
          ws.send(JSON.stringify(results))
          return
        }

        if (data.type === 'theme') {
          // Theme is per-workspace
          const workspaces = await listWorkspaces()
          if (workspaces.length === 0) {
            ws.send(JSON.stringify({ error: 'No workspaces registered' }))
            return
          }
          const workspacePath = String(data.path ?? workspaces[0].path)
          const layout = await loadLayout(workspacePath)
          if (!data.font) {
            ws.send(JSON.stringify({ currentFont: layout.theme?.font ?? 'system' }))
            return
          }
          if (!(data.font in FONT_THEMES)) {
            ws.send(JSON.stringify({ error: `Unknown font theme: ${data.font}` }))
            return
          }
          await saveLayout({ ...layout, theme: { font: data.font } }, workspacePath)
          publishMei({ type: 'theme:updated' })
          ws.send(JSON.stringify({ ok: true, font: data.font }))
        }
      } catch {}
    }
  }
})
