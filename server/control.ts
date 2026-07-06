import { resolve } from 'path'

import type { WorkspaceEntry } from '@/lib/types'

import { CONTROL_PORT } from './constants'
import { applyEnvChanged } from './env-apply'
import { processIcon } from './icon'
import { loadLayout, saveLayout } from './layout'
import { publishEvent } from './events'
import { findWorkspaceForPath, listWorkspaces, registerWorkspace } from './registry'
import { executeScratchOp } from './scratchpad-executor'
import { readScratchpadImage, readScratchpadShapes } from './scratchpad'
import { relayScratchOp } from './scratchpad-relay'
import { broadcastAll } from './state'
import { applyThemeUpdate, matchColorTheme } from './theme'
import { handleBundle } from './widgets'
import { handleBundleViews } from './views'
import { getWorkspaceConfig, setWorkspaceConfig } from './workspace-config'

type ControlSocket = { send(data: string): void }

// Resolve a control request's `path` to the registered workspace that contains
// it — the entry itself or its nearest registered ancestor — so every
// workspace-scoped command (bundle/theme/config/scratch) works from `.moi/` or
// any subdirectory instead of operating on a phantom nested path. Sends a clear
// error and returns null when nothing is registered, or the path is outside
// every workspace.
async function resolveWorkspace(
  ws: ControlSocket,
  rawPath: unknown
): Promise<WorkspaceEntry | null> {
  const workspaces = await listWorkspaces()
  if (workspaces.length === 0) {
    ws.send(JSON.stringify({ error: 'No workspaces registered' }))
    return null
  }
  const reqPath = resolve(String(rawPath ?? workspaces[0].path))
  const match = findWorkspaceForPath(workspaces, reqPath)
  if (!match) {
    ws.send(
      JSON.stringify({
        error: `${reqPath} is not inside a registered moi workspace. Open it in moi, or run from the workspace root.`
      })
    )
    return null
  }
  return match
}

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
          // Resolve to the real workspace root (works from `.moi/` or any
          // subdir; errors when outside every registered workspace) so a bundle
          // never targets a phantom nested `.moi/.moi`.
          const match = await resolveWorkspace(ws, data.path)
          if (!match) return
          const workspacePath = match.path
          const force = !!data.force
          // `only` narrows to one kind; default builds both. Results carry a
          // `kind` so the CLI can label each row.
          const only = data.only === 'widgets' || data.only === 'views' ? data.only : undefined
          const results: {
            kind: 'widget' | 'view'
            name: string
            status: string
            error?: string
          }[] = []
          if (only !== 'views') {
            for (const r of await handleBundle(publishEvent, workspacePath, force)) {
              results.push({ kind: 'widget', name: r.name, status: r.status, error: r.error })
            }
          }
          if (only !== 'widgets') {
            for (const r of await handleBundleViews(publishEvent, workspacePath, force)) {
              results.push({ kind: 'view', name: r.name, status: r.status, error: r.error })
            }
          }
          ws.send(JSON.stringify({ ok: true, workspacePath, results }))
          return
        }

        if (data.type === 'widget:refresh') {
          // Tell every connected widget to re-import its module (cache-bust)
          // and re-run its data fetches. No rebuild, no page reload — the
          // existing `useWidget` hook handles `widgets:refresh` identically
          // to `widget:updated` (load with bust=true).
          publishEvent({ type: 'widgets:refresh' })
          ws.send(JSON.stringify({ ok: true }))
          return
        }

        if (data.type === 'env:changed') {
          // A CLI env write (`moi env set`/`unset`) already landed on disk —
          // reap + broadcast so it takes effect (same path as PUT /env).
          const match = await resolveWorkspace(ws, data.path)
          if (!match) return
          applyEnvChanged(match)
          ws.send(JSON.stringify({ ok: true }))
          return
        }

        if (data.type === 'theme') {
          // Theme is per-workspace — resolve to the real root (subdir-safe).
          const match = await resolveWorkspace(ws, data.path)
          if (!match) return
          const workspacePath = match.path
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
          publishEvent({ type: 'theme:updated' })
          ws.send(JSON.stringify({ ok: true, ...result.applied }))
          return
        }

        if (data.type === 'config') {
          // Workspace identity (name + icon) is per-workspace — subdir-safe.
          const match = await resolveWorkspace(ws, data.path)
          if (!match) return
          const workspacePath = match.path
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
          publishEvent({ type: 'workspace:updated' })
          ws.send(
            JSON.stringify({
              ok: true,
              name: patch.name ?? null,
              icon: hasIcon,
              clearedName: clearName,
              clearedIcon: clearIcon
            })
          )
          return
        }

        if (data.type === 'scratch') {
          const op = data.op
          if (!op || typeof op.kind !== 'string') {
            ws.send(JSON.stringify({ error: 'Missing scratch op' }))
            return
          }
          // Resolve to the real workspace root (subdir-safe) — both the on-disk
          // read and the live relay use it.
          const match = await resolveWorkspace(ws, data.path)
          if (!match) return

          // `read` is served straight off the disk snapshot — no live tab needed.
          if (op.kind === 'read') {
            ws.send(JSON.stringify({ shapes: await readScratchpadShapes(match.path) }))
            return
          }

          // `read-image` resolves one image shape's data off disk too — `read`
          // omits the blob, so this is how the agent pulls a specific image.
          if (op.kind === 'read-image') {
            ws.send(JSON.stringify(await readScratchpadImage(match.path, String(op.name))))
            return
          }

          // Assign add ops a stable name when the caller didn't (`--id`), so the
          // derived tldraw shape id is deterministic and addressable later.
          if (op.kind.startsWith('add-') && !op.name) {
            op.name = `s_${crypto.randomUUID().slice(0, 8)}`
          }

          try {
            // `view` renders pixels — only the browser can do that, so it relays to
            // a live tab (and fails if none is open). Every mutation runs headlessly
            // against the disk snapshot, so drawing never needs an open canvas.
            const result =
              op.kind === 'view'
                ? await relayScratchOp(match.id, op)
                : await executeScratchOp(match.path, match.id, op)
            ws.send(JSON.stringify({ ok: true, result }))
          } catch (err) {
            ws.send(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
          }
          return
        }
      } catch (err) {
        console.error('[control]', err)
        ws.send(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
      }
    }
  }
})
