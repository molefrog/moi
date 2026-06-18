import { resolve } from 'path'

import { CONTROL_PORT } from './constants'
import { processIcon } from './icon'
import { loadLayout, saveLayout } from './layout'
import { publishMei } from './mei'
import { listWorkspaces, registerWorkspace } from './registry'
import { broadcastAll } from './state'
import { applyThemeUpdate, matchColorTheme } from './theme'
import { handleBundle } from './widgets'
import { handleBundleViews } from './views'
import { getWorkspaceConfig, setWorkspaceConfig } from './workspace-config'

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
          const force = !!data.force
          // `only` narrows to one kind; default builds both. Results carry a
          // `kind` so the CLI can label each row.
          const only = data.only === 'widgets' || data.only === 'views' ? data.only : undefined
          const out: { kind: 'widget' | 'view'; name: string; status: string; error?: string }[] =
            []
          if (only !== 'views') {
            for (const r of await handleBundle(publishMei, workspacePath, force)) {
              out.push({ kind: 'widget', name: r.name, status: r.status, error: r.error })
            }
          }
          if (only !== 'widgets') {
            for (const r of await handleBundleViews(publishMei, workspacePath, force)) {
              out.push({ kind: 'view', name: r.name, status: r.status, error: r.error })
            }
          }
          ws.send(JSON.stringify(out))
          return
        }

        if (data.type === 'widget:refresh') {
          // Tell every connected widget to re-import its module (cache-bust)
          // and re-run its data fetches. No rebuild, no page reload — the
          // existing `useWidget` hook handles `widgets:refresh` identically
          // to `widget:updated` (load with bust=true).
          publishMei({ type: 'widgets:refresh' })
          ws.send(JSON.stringify({ ok: true }))
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

          // Listing mode — neither axis requested
          if (!data.font && !data.color) {
            ws.send(
              JSON.stringify({
                currentFont: layout.theme?.font ?? 'default',
                currentColor: matchColorTheme(layout.theme?.background, layout.theme?.foreground)
              })
            )
            return
          }

          const result = applyThemeUpdate(layout.theme, { font: data.font, color: data.color })
          if (!result.ok) {
            ws.send(JSON.stringify({ error: result.error }))
            return
          }

          await saveLayout({ ...layout, theme: result.theme }, workspacePath)
          publishMei({ type: 'theme:updated' })
          ws.send(JSON.stringify({ ok: true, ...result.applied }))
        }

        if (data.type === 'config') {
          // Workspace identity (name + icon) is per-workspace.
          const workspaces = await listWorkspaces()
          if (workspaces.length === 0) {
            ws.send(JSON.stringify({ error: 'No workspaces registered' }))
            return
          }
          const workspacePath = String(data.path ?? workspaces[0].path)
          const hasName = typeof data.name === 'string'
          const hasIcon = typeof data.iconPath === 'string'
          const clearName = data.clearName === true
          const clearIcon = data.clearIcon === true

          // Listing mode — no field requested.
          if (!hasName && !hasIcon && !clearName && !clearIcon) {
            const cfg = await getWorkspaceConfig(workspacePath)
            ws.send(
              JSON.stringify({ name: cfg.name ?? null, hasIcon: !!cfg.icon, path: workspacePath })
            )
            return
          }

          // `null` clears a field; a value sets it; `undefined` leaves it unchanged.
          const patch: { name?: string | null; icon?: string | null } = {}
          if (clearName) patch.name = null
          else if (hasName) patch.name = String(data.name)
          if (clearIcon) patch.icon = null
          else if (hasIcon) {
            try {
              patch.icon = await processIcon(String(data.iconPath))
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              ws.send(JSON.stringify({ error: `Could not read image: ${msg}` }))
              return
            }
          }

          await setWorkspaceConfig(workspacePath, patch)
          publishMei({ type: 'workspace:updated' })
          ws.send(
            JSON.stringify({
              ok: true,
              name: patch.name ?? null,
              icon: hasIcon,
              clearedName: clearName,
              clearedIcon: clearIcon
            })
          )
        }
      } catch (err) {
        console.error('[control]', err)
        ws.send(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
      }
    }
  }
})
