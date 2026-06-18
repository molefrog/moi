import { existsSync } from 'node:fs'
import { basename, join, sep } from 'node:path'

import type { ClientMessage, EnvScope, WorkspaceModels, WorkspaceType } from '@/lib/types'

import index from '../client/index.html'
import { getClaudeModels } from './agent'
import {
  getCCRunningSessions,
  interruptCCSession,
  killAllCCSessions,
  restartWorkspaceSessions,
  sendCCMessage
} from './cc-session'
import { PORT } from './constants'
import { control } from './control'
import { callFunction, killAllWorkers, parseFunctionPath, restartWorker } from './functions'
import { processIcon } from './icon'
import { getWorkspacePreview, loadLayout, saveLayout } from './layout'
import { getMcpStatus } from './mcp'
import { getOpenClawModels, getOpenClawSessionMessages, getOpenClawSessions } from './openclaw'
import { toSessionInfo, toStreamEvents } from './openclaw-adapter'
import {
  abortOpenClawRun,
  ensureOpenClawSessionLive,
  getLiveOpenClawEvents,
  getOpenClawRunningSessions,
  sendOpenClawMessage
} from './openclaw-session'
import {
  discoverWorkspaces,
  getWorkspace,
  listWorkspaces,
  registerWorkspace,
  removeWorkspace
} from './registry'
import { addClient, getSessionEvents, getSessions, removeClient, sendToClient } from './state'
import {
  getWorkspaceEnvView,
  isValidEnvKey,
  isValidScope,
  updateWorkspaceEnv
} from './workspace-env'
import { collectRequiredEnv, listWidgets, serveWidget } from './widgets'
import { collectViewRequiredEnv, listViews, serveView } from './views'
import type { EnvUpdate } from './workspace-env'
import { getWorkspaceConfig, setWorkspaceConfig } from './workspace-config'

const MEI_TOPIC = 'mei'

// The env "required" view aggregates `config.requiredEnv` declared by both
// widgets and views, each key mapped to the bundle ids that asked for it.
async function requiredEnvFor(workspacePath: string): Promise<Record<string, string[]>> {
  const [widgets, views] = await Promise.all([
    collectRequiredEnv(workspacePath),
    collectViewRequiredEnv(workspacePath)
  ])
  const out: Record<string, string[]> = {}
  for (const map of [widgets, views]) {
    for (const [key, ids] of Object.entries(map)) {
      out[key] = [...(out[key] ?? []), ...ids]
    }
  }
  return out
}

type WsData = { channel: 'chat' | 'mei'; workspaceId: string }

function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  const v = value as {
    type: string
    workspaceId?: unknown
    sessionId?: unknown
    content?: unknown
    isNew?: unknown
    optimisticId?: unknown
    model?: unknown
  }
  if (v.type === 'chat')
    return (
      typeof v.workspaceId === 'string' &&
      typeof v.content === 'string' &&
      typeof v.sessionId === 'string' &&
      typeof v.isNew === 'boolean' &&
      (v.optimisticId === undefined || typeof v.optimisticId === 'string') &&
      (v.model === undefined || typeof v.model === 'string')
    )
  if (v.type === 'stop') return typeof v.workspaceId === 'string' && typeof v.sessionId === 'string'
  return false
}

// Production (published/global install) ships a prebuilt client in `dist/`
// (see scripts/build-client.ts). When present we serve it as static files,
// because Bun's runtime bundler won't run plugins on source under the global
// install tree. In dev there is no `dist/`, so we fall back to the imported
// HTML route + Bun.serve's live bundler (HMR). `import.meta.dir` is server/.
const DIST_DIR = join(import.meta.dir, '..', 'dist')
const DIST_INDEX = join(DIST_DIR, 'index.html')
// Serve prebuilt static assets when `dist/` exists — but never in dev mode
// (MOI_DEV is set by the dev supervisor), so `bun run dev` always uses the
// live bundler + HMR even if a stale `dist/` is lying around the working tree.
const serveStatic = !process.env.MOI_DEV && existsSync(DIST_INDEX)

// The SPA shell: prebuilt index.html in prod, the live-bundled HTML in dev.
const shell = serveStatic ? () => new Response(Bun.file(DIST_INDEX)) : index

// Serve a hashed asset (`/chunk-….js`, `/favicon-….png`, …) from `dist/`.
// Returns null when the path isn't a real file under dist (path-traversal safe).
async function serveDistAsset(pathname: string): Promise<Response | null> {
  if (!serveStatic) return null
  const filePath = join(DIST_DIR, pathname)
  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + sep)) return null
  const file = Bun.file(filePath)
  return (await file.exists()) ? new Response(file) : null
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
  // HMR only in dev; prod serves prebuilt static assets (no bundler).
  development: serveStatic ? false : { hmr: true },
  routes: {
    // Client-side routes — serve the SPA shell
    '/': shell,
    '/playground': shell,
    '/playground/*': shell,
    '/workspace/*': shell,

    // Workspace registry API
    '/api/workspaces': async req => {
      if (req.method === 'GET') {
        // Merge each workspace's live layout name/icon over the registry
        // snapshot so the sidebar reflects `moi config` changes immediately.
        const entries = await listWorkspaces()
        const merged = await Promise.all(
          entries.map(async e => {
            const layout = await loadLayout(e.path)
            return { ...e, name: layout.name ?? e.name, icon: layout.icon }
          })
        )
        return Response.json(merged)
      }
      if (req.method === 'POST') {
        const body = await req.json()
        if (!body?.path) return new Response('Missing path', { status: 400 })
        const rawType = body?.type
        const type = rawType === 'claude-code' || rawType === 'openclaw' ? rawType : undefined
        const entry = await registerWorkspace(String(body.path), {
          type,
          name: typeof body?.name === 'string' ? body.name : undefined,
          agentId: typeof body?.agentId === 'string' ? body.agentId : undefined,
          isDefault: typeof body?.isDefault === 'boolean' ? body.isDefault : undefined,
          lastRunAt: typeof body?.lastRunAt === 'string' ? body.lastRunAt : undefined
        })
        return Response.json(entry, { status: 201 })
      }
      return new Response('Method not allowed', { status: 405 })
    },
    '/api/workspaces/discover': async () => Response.json(await discoverWorkspaces()),
    '/api/workspaces/:id/preview': async req => {
      const ws = await getWorkspace(req.params.id)
      if (!ws) return Response.json({ cols: 4, items: [] })
      return Response.json(await getWorkspacePreview(ws.path))
    },
    '/api/workspaces/:id/widgets': async req => {
      const ws = await getWorkspace(req.params.id)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      return listWidgets(ws.path)
    },
    '/api/workspaces/:id/sessions': async req => {
      const ws = await getWorkspace(req.params.id)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      if (ws.type === 'openclaw') {
        const rows = await getOpenClawSessions(ws.path, ws.agentId)
        return Response.json(rows.map(r => toSessionInfo(r, ws.path)))
      }
      return Response.json(await getSessions(ws.path))
    },
    // Widget bundle: the compiled ESM module for one widget, dynamically
    // imported by the client (useWidget). Sits beside the GET .../widgets list
    // above — the exact path lists, `/*` serves a bundle.
    '/api/workspaces/:id/widgets/*': async req => {
      const ws = await getWorkspace(req.params.id)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      const name = new URL(req.url).pathname.split('/').pop()?.replace(/\.js$/, '')
      return name ? serveWidget(name, ws.path) : new Response('Not found', { status: 404 })
    },
    // Views — full-screen agent apps. Mirrors the widget pair above: the exact
    // path lists (in manifest/nav order), `/*` serves one compiled bundle.
    '/api/workspaces/:id/views': async req => {
      const ws = await getWorkspace(req.params.id)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      return listViews(ws.path)
    },
    '/api/workspaces/:id/views/*': async req => {
      const ws = await getWorkspace(req.params.id)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      const name = new URL(req.url).pathname.split('/').pop()?.replace(/\.js$/, '')
      return name ? serveView(name, ws.path) : new Response('Not found', { status: 404 })
    },
    '/api/workspaces/:id/sessions/:sessionId/events': async req => {
      const ws = await getWorkspace(req.params.id)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      if (ws.type === 'openclaw') {
        // Prefer the live view if we already hold one — keeps REST + WS in
        // agreement for any reload that lands while a run is active. The
        // first cold call also primes the live subscription so subsequent
        // WS frames upsert into the same view.
        const live = getLiveOpenClawEvents(req.params.id, req.params.sessionId)
        if (live) return Response.json(live)
        if (ws.agentId) {
          try {
            const evs = await ensureOpenClawSessionLive({
              workspaceId: req.params.id,
              workspacePath: ws.path,
              agentId: ws.agentId,
              sessionId: req.params.sessionId
            })
            return Response.json(evs)
          } catch {
            // fall through to static path
          }
        }
        const preview = await getOpenClawSessionMessages(req.params.sessionId, ws.path, ws.agentId)
        return Response.json(toStreamEvents(preview))
      }
      return Response.json(await getSessionEvents(req.params.sessionId, ws.path))
    },
    '/api/workspaces/:id/mcp': async req => {
      const ws = await getWorkspace(req.params.id)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      return Response.json(await getMcpStatus(ws.path))
    },
    // Per-workspace env vars. GET returns the effective view (discovered `.env`
    // + UI custom secrets + scopes + declared-required keys; values masked). PUT
    // patches custom secrets (set/remove/scopes) and/or the inheritDotenv mode,
    // then reaps the workspace's function worker and idle agent sessions so the
    // next call/message picks up the change (env is frozen at spawn — a hard
    // restart is the only way).
    '/api/workspaces/:id/env': async req => {
      const ws = await getWorkspace(req.params.id)
      if (!ws) return new Response('Workspace not found', { status: 404 })

      if (req.method === 'GET') {
        const required = await requiredEnvFor(ws.path)
        return Response.json(await getWorkspaceEnvView(ws.path, required))
      }
      if (req.method === 'PUT') {
        const body = await req.json().catch(() => null)
        if (!body || typeof body !== 'object') {
          return new Response('Bad request', { status: 400 })
        }
        const patch: EnvUpdate = {}
        if (body.set !== undefined) {
          if (typeof body.set !== 'object' || body.set === null) {
            return new Response('set must be an object', { status: 400 })
          }
          for (const [k, v] of Object.entries(body.set)) {
            if (!isValidEnvKey(k)) return new Response(`Invalid env key: ${k}`, { status: 400 })
            if (typeof v !== 'string') {
              return new Response(`Value for ${k} must be a string`, { status: 400 })
            }
          }
          patch.set = body.set as Record<string, string>
        }
        if (body.remove !== undefined) {
          if (!Array.isArray(body.remove) || body.remove.some(k => typeof k !== 'string')) {
            return new Response('remove must be an array of strings', { status: 400 })
          }
          patch.remove = body.remove as string[]
        }
        if (body.scopes !== undefined) {
          if (typeof body.scopes !== 'object' || body.scopes === null) {
            return new Response('scopes must be an object', { status: 400 })
          }
          for (const [k, s] of Object.entries(body.scopes)) {
            if (!isValidScope(s)) return new Response(`Invalid scope for ${k}`, { status: 400 })
          }
          patch.scopes = body.scopes as Record<string, EnvScope>
        }
        if (body.inheritDotenv !== undefined) {
          if (typeof body.inheritDotenv !== 'boolean') {
            return new Response('inheritDotenv must be a boolean', { status: 400 })
          }
          patch.inheritDotenv = body.inheritDotenv
        }

        // Skip the write + reaps for a no-op PUT (no recognized fields) so an
        // empty body doesn't needlessly kill warm workers / idle sessions.
        const hasChange =
          patch.set !== undefined ||
          patch.remove !== undefined ||
          patch.scopes !== undefined ||
          patch.inheritDotenv !== undefined
        if (hasChange) {
          await updateWorkspaceEnv(ws.path, patch)
          // Frozen-at-spawn: reap workers/idle sessions so fresh env takes effect.
          restartWorker(ws.path)
          restartWorkspaceSessions(ws.path)
        }

        const required = await requiredEnvFor(ws.path)
        return Response.json(await getWorkspaceEnvView(ws.path, required))
      }
      return new Response('Method not allowed', { status: 405 })
    },
    // Models the workspace's agent backend can run, normalized across providers.
    // OpenClaw queries the gateway catalog; everything else (Claude Code) reads
    // the account-wide Agent SDK model list.
    '/api/workspaces/:id/models': async req => {
      const ws = await getWorkspace(req.params.id)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      const provider: WorkspaceType = ws.type ?? 'claude-code'
      const models =
        provider === 'openclaw' ? await getOpenClawModels() : await getClaudeModels(ws.path)
      return Response.json({ provider, models } satisfies WorkspaceModels)
    },
    // Workspace identity (name). GET returns the current {name, icon}; PUT a
    // JSON `{ name }` sets it (or `null` clears it). Broadcasts so the sidebar
    // and header update live. Icon is handled by the binary route below.
    '/api/workspaces/:id/config': async req => {
      const ws = await getWorkspace(req.params.id)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      if (req.method === 'GET') return Response.json(await getWorkspaceConfig(ws.path))
      if (req.method === 'PUT') {
        const body = await req.json().catch(() => null)
        const name = body?.name
        if (name !== null && typeof name !== 'string') {
          return new Response('Expected { name: string | null }', { status: 400 })
        }
        await setWorkspaceConfig(ws.path, { name })
        publishMei({ type: 'workspace:updated' })
        return Response.json(await getWorkspaceConfig(ws.path))
      }
      return new Response('Method not allowed', { status: 405 })
    },
    // Workspace icon. PUT a raw image body (png/jpg/gif/webp) — the server
    // resizes it to a 128×128 transparent WebP and stores it as base64. DELETE
    // resets to the provider default. Both broadcast for a live refresh.
    '/api/workspaces/:id/icon': async req => {
      const ws = await getWorkspace(req.params.id)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      if (req.method === 'PUT') {
        const bytes = new Uint8Array(await req.arrayBuffer())
        if (bytes.length === 0) return new Response('Empty image body', { status: 400 })
        let icon: string
        try {
          icon = await processIcon(bytes)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return new Response(`Invalid image: ${msg}`, { status: 400 })
        }
        await setWorkspaceConfig(ws.path, { icon })
        publishMei({ type: 'workspace:updated' })
        return Response.json({ icon })
      }
      if (req.method === 'DELETE') {
        await setWorkspaceConfig(ws.path, { icon: null })
        publishMei({ type: 'workspace:updated' })
        return new Response(null, { status: 204 })
      }
      return new Response('Method not allowed', { status: 405 })
    },
    // Live widget-event stream (build/refresh pushes). A static path, so Bun
    // routes it ahead of the `/api/workspaces/:id` param route below; the
    // upgrade happens in-handler via the route's `server` argument.
    '/api/workspaces/ws': (req, server) =>
      upgrade(server, req, { channel: 'mei', workspaceId: '' }),
    // All info about a single workspace: its persisted layout (widget grid,
    // chat mode, theme) plus server-resolved metadata. GET reads, PUT writes
    // the layout, DELETE unregisters.
    '/api/workspaces/:id': async req => {
      if (req.method === 'DELETE') {
        const ok = await removeWorkspace(req.params.id)
        if (!ok) return new Response('Workspace not found', { status: 404 })
        return new Response(null, { status: 204 })
      }
      const ws = await getWorkspace(req.params.id)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      if (req.method === 'GET') {
        const layout = await loadLayout(ws.path)
        return Response.json({
          ...layout,
          // Resolved display name: the settings override, or the folder name.
          name: layout.name || basename(ws.path),
          cwd: ws.path,
          provider: ws.type,
          agentId: ws.agentId
        })
      }
      if (req.method === 'PUT') {
        const body = await req.json()
        if (!body || body.version !== 1) return new Response('Bad request', { status: 400 })
        await saveLayout(body, ws.path)
        return new Response(null, { status: 204 })
      }
      return new Response('Method not allowed', { status: 405 })
    },

    // Widget RPC: a widget bundle POSTs here to call one of its `.server.ts`
    // functions. Kept on its own internal `/_rpc/` prefix, off the public API.
    '/_rpc/:wid/fn/*': async req => {
      if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
      const ws = await getWorkspace(req.params.wid)
      if (!ws) return new Response('Workspace not found', { status: 404 })
      const prefix = `/_rpc/${req.params.wid}/fn/`
      const tail = new URL(req.url).pathname.slice(prefix.length)
      return handleFunctionCall(req, tail, ws.path)
    }
  },
  async fetch(req, server) {
    const url = new URL(req.url)
    // Chat websocket — app-wide (one per client, not per workspace). Each chat
    // frame carries its own workspaceId. The widget-event websocket lives in
    // the routes table at /api/workspaces/ws.
    if (url.pathname === '/ws') {
      return upgrade(server, req, { channel: 'chat', workspaceId: '' })
    }
    // Prod: serve prebuilt hashed assets (/chunk-….js, /favicon-….png, …).
    // No-op in dev (the live bundler serves assets via the HTML route).
    if (req.method === 'GET') {
      const asset = await serveDistAsset(url.pathname)
      if (asset) return asset
    }
    return new Response('Not found', { status: 404 })
  },
  websocket: {
    open(ws) {
      if (ws.data.channel === 'chat') {
        addClient(ws)
        // Authoritative snapshot of every running session (CC + OpenClaw) so the
        // client can light/clear spinners correctly even for runs whose status
        // transitions it missed while disconnected.
        const running = [...getCCRunningSessions(), ...getOpenClawRunningSessions()]
        sendToClient(ws, { type: 'status_snapshot', running })
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
          const workspace = await getWorkspace(data.workspaceId)
          if (!workspace) return
          if (workspace.type === 'openclaw' && workspace.agentId) {
            sendOpenClawMessage({
              workspaceId: data.workspaceId,
              workspacePath: workspace.path,
              agentId: workspace.agentId,
              sessionId: data.sessionId,
              isNew: data.isNew,
              content: data.content.trim(),
              optimisticId: data.optimisticId
            })
          } else {
            sendCCMessage({
              workspaceId: data.workspaceId,
              workspacePath: workspace.path,
              sessionId: data.sessionId,
              isNew: data.isNew,
              content: data.content.trim(),
              optimisticId: data.optimisticId,
              model: data.model
            })
          }
        }
        if (data.type === 'stop') {
          const workspace = await getWorkspace(data.workspaceId)
          if (workspace?.type === 'openclaw') {
            abortOpenClawRun({ workspaceId: data.workspaceId, sessionId: data.sessionId })
          } else {
            interruptCCSession(data.workspaceId, data.sessionId)
          }
        }
      } catch {}
    },
    close(ws) {
      if (ws.data.channel === 'chat') removeClient(ws)
      else ws.unsubscribe(MEI_TOPIC)
    }
  }
})

async function handleFunctionCall(
  req: Request,
  tail: string,
  workspacePath: string
): Promise<Response> {
  // Module keys may contain slashes (`widgets/hello/getWeather`), so the
  // tail is parsed on the last slash — see parseFunctionPath.
  const parsed = parseFunctionPath(tail)
  if (!parsed) {
    return new Response('Invalid module or function name', { status: 400 })
  }
  const { module, name } = parsed

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

// Graceful shutdown. In dev the supervisor sends SIGTERM on server-file
// changes; in any context Ctrl-C sends SIGINT. Close both servers and kill the
// per-workspace function workers so no child processes are orphaned.
function shutdown() {
  try {
    app.stop(true)
  } catch {}
  try {
    control.stop(true)
  } catch {}
  killAllCCSessions()
  killAllWorkers()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
