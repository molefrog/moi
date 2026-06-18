import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { basename } from 'node:path'

import type { EnvScope, WorkspaceEntry, WorkspaceModels, WorkspaceType } from '@/lib/types'

import { getClaudeModels } from './agent'
import { apiBaseFor, parseAppletTail, serveWorkspaceFile } from './applets'
import { restartWorkspaceSessions } from './cc-session'
import { callFunction, parseFunctionPath, restartWorker } from './functions'
import { processIcon } from './icon'
import { getWorkspacePreview, loadLayout, mergeLayoutForSave, saveLayout } from './layout'
import { getMcpStatus } from './mcp'
import { publishMei } from './mei'
import { getOpenClawModels, getOpenClawSessionMessages, getOpenClawSessions } from './openclaw'
import { toSessionInfo, toStreamEvents } from './openclaw-adapter'
import { ensureOpenClawSessionLive, getLiveOpenClawEvents } from './openclaw-session'
import {
  discoverWorkspaces,
  getWorkspace,
  listWorkspaces,
  registerWorkspace,
  removeWorkspace
} from './registry'
import { serveDistAsset } from './static'
import { getSessionEvents, getSessions } from './state'
import { collectViewRequiredEnv, listViews, serveView } from './views'
import { collectRequiredEnv, listWidgets, serveWidget } from './widgets'
import { getWorkspaceConfig, setWorkspaceConfig } from './workspace-config'
import {
  getWorkspaceEnvView,
  isValidEnvKey,
  isValidScope,
  updateWorkspaceEnv
} from './workspace-env'
import type { EnvUpdate } from './workspace-env'

// The resolved workspace is stashed on the context by `withWorkspace`, so every
// `/api/workspaces/:id/*` handler can read it without re-querying the registry.
type ApiEnv = { Variables: { ws: WorkspaceEntry } }

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

// Resolve `:id` to a registered workspace once, 404 if unknown, and stash it on
// the context. Mounted on the single-workspace sub-app so every nested route
// shares the lookup instead of repeating `getWorkspace(...) ?? 404`.
const withWorkspace = createMiddleware<ApiEnv>(async (c, next) => {
  const ws = await getWorkspace(c.req.param('id'))
  if (!ws) return c.text('Workspace not found', 404)
  c.set('ws', ws)
  await next()
})

// ---- single workspace: /api/workspaces/:id/* --------------------------------
const one = new Hono<ApiEnv>()
one.use('*', withWorkspace)

one.get('/preview', async c => {
  return c.json(await getWorkspacePreview(c.get('ws').path))
})

one.get('/widgets', c => listWidgets(c.get('ws').path))

// Widget bundle: the compiled ESM for one widget, dynamically imported by the
// client (useWidget). Sits beside the GET .../widgets list above — the exact
// path lists, `/*` serves a file from the bundle dir (`<name>/<file>`:
// index.js, a chunk, or a hashed asset).
one.get('/widgets/*', c => {
  const id = c.req.param('id')
  const { name, file } = parseAppletTail(c.req.url, id, 'widgets')
  if (!name) return c.text('Not found', 404)
  return serveWidget(name, file, c.get('ws').path, apiBaseFor(id))
})

// Views — full-screen agent apps. Mirrors the widget pair above: the exact path
// lists (in manifest/nav order), `/*` serves one bundle file.
one.get('/views', c => listViews(c.get('ws').path))

one.get('/views/*', c => {
  const id = c.req.param('id')
  const { name, file } = parseAppletTail(c.req.url, id, 'views')
  if (!name) return c.text('Not found', 404)
  return serveView(name, file, c.get('ws').path, apiBaseFor(id))
})

// Workspace file stream — an applet's `fileUrl(path)` resolves here. Streams a
// media file from the workspace root (range-enabled). Guarded: traversal and
// dotfiles (`.env`, `.moi`, `.git`) are rejected and only media/asset extensions
// are allowed — the workspace holds secrets, and this route is unauthenticated.
// localhost binding is NOT the guard.
one.get('/fs/*', c => {
  const id = c.req.param('id')
  const tail = new URL(c.req.url).pathname.split(`/api/workspaces/${id}/fs/`)[1] ?? ''
  return serveWorkspaceFile(c.get('ws').path, tail, c.req.header('range'))
})

// Applet RPC — the home for server-function calls from a bundle. The bundle's
// sentinel base resolves to `/api/workspaces/<id>`, so it POSTs to
// `…/rpc/<module>/<fn>`. (The legacy `/_rpc/:wid/fn/*` below still works for any
// bundle built before this route existed.)
one.post('/rpc/*', c => {
  const id = c.req.param('id')
  const tail = new URL(c.req.url).pathname.split(`/api/workspaces/${id}/rpc/`)[1] ?? ''
  return handleFunctionCall(c.req.raw, tail, c.get('ws').path)
})

one.get('/sessions', async c => {
  const ws = c.get('ws')
  if (ws.type === 'openclaw') {
    const rows = await getOpenClawSessions(ws.path, ws.agentId)
    return c.json(rows.map(r => toSessionInfo(r, ws.path)))
  }
  return c.json(await getSessions(ws.path))
})

one.get('/sessions/:sessionId/events', async c => {
  const ws = c.get('ws')
  const id = c.req.param('id')
  const sessionId = c.req.param('sessionId')
  if (ws.type === 'openclaw') {
    // Prefer the live view if we already hold one — keeps REST + WS in
    // agreement for any reload that lands while a run is active. The first cold
    // call also primes the live subscription so subsequent WS frames upsert into
    // the same view.
    const live = getLiveOpenClawEvents(id, sessionId)
    if (live) return c.json(live)
    if (ws.agentId) {
      try {
        const evs = await ensureOpenClawSessionLive({
          workspaceId: id,
          workspacePath: ws.path,
          agentId: ws.agentId,
          sessionId
        })
        return c.json(evs)
      } catch {
        // fall through to static path
      }
    }
    const preview = await getOpenClawSessionMessages(sessionId, ws.path, ws.agentId)
    return c.json(toStreamEvents(preview))
  }
  return c.json(await getSessionEvents(sessionId, ws.path))
})

one.get('/mcp', async c => {
  return c.json(await getMcpStatus(c.get('ws').path))
})

// Per-workspace env vars. GET returns the effective view (discovered `.env` + UI
// custom secrets + scopes + declared-required keys; values masked).
one.get('/env', async c => {
  const ws = c.get('ws')
  const required = await requiredEnvFor(ws.path)
  return c.json(await getWorkspaceEnvView(ws.path, required))
})

// PUT patches custom secrets (set/remove/scopes) and/or the inheritDotenv mode,
// then reaps the workspace's function worker and idle agent sessions so the next
// call/message picks up the change (env is frozen at spawn — a hard restart is
// the only way).
one.put('/env', async c => {
  const ws = c.get('ws')
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return c.text('Bad request', 400)
  }
  const patch: EnvUpdate = {}
  if (body.set !== undefined) {
    if (typeof body.set !== 'object' || body.set === null) {
      return c.text('set must be an object', 400)
    }
    for (const [k, v] of Object.entries(body.set)) {
      if (!isValidEnvKey(k)) return c.text(`Invalid env key: ${k}`, 400)
      if (typeof v !== 'string') {
        return c.text(`Value for ${k} must be a string`, 400)
      }
    }
    patch.set = body.set as Record<string, string>
  }
  if (body.remove !== undefined) {
    if (!Array.isArray(body.remove) || body.remove.some((k: unknown) => typeof k !== 'string')) {
      return c.text('remove must be an array of strings', 400)
    }
    patch.remove = body.remove as string[]
  }
  if (body.scopes !== undefined) {
    if (typeof body.scopes !== 'object' || body.scopes === null) {
      return c.text('scopes must be an object', 400)
    }
    for (const [k, s] of Object.entries(body.scopes)) {
      if (!isValidScope(s)) return c.text(`Invalid scope for ${k}`, 400)
    }
    patch.scopes = body.scopes as Record<string, EnvScope>
  }
  if (body.inheritDotenv !== undefined) {
    if (typeof body.inheritDotenv !== 'boolean') {
      return c.text('inheritDotenv must be a boolean', 400)
    }
    patch.inheritDotenv = body.inheritDotenv
  }

  // Skip the write + reaps for a no-op PUT (no recognized fields) so an empty
  // body doesn't needlessly kill warm workers / idle sessions.
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
  return c.json(await getWorkspaceEnvView(ws.path, required))
})

// Models the workspace's agent backend can run, normalized across providers.
// OpenClaw queries the gateway catalog; everything else (Claude Code) reads the
// account-wide Agent SDK model list.
one.get('/models', async c => {
  const ws = c.get('ws')
  const provider: WorkspaceType = ws.type ?? 'claude-code'
  const models =
    provider === 'openclaw' ? await getOpenClawModels() : await getClaudeModels(ws.path)
  return c.json({ provider, models } satisfies WorkspaceModels)
})

// Workspace identity (name). GET returns the current {name, icon}; PUT a JSON
// `{ name }` sets it (or `null` clears it). Broadcasts so the sidebar and header
// update live. Icon is handled by the binary route below.
one.get('/config', async c => {
  return c.json(await getWorkspaceConfig(c.get('ws').path))
})

one.put('/config', async c => {
  const ws = c.get('ws')
  const body = await c.req.json().catch(() => null)
  const name = body?.name
  if (name !== null && typeof name !== 'string') {
    return c.text('Expected { name: string | null }', 400)
  }
  await setWorkspaceConfig(ws.path, { name })
  publishMei({ type: 'workspace:updated' })
  return c.json(await getWorkspaceConfig(ws.path))
})

// Workspace icon. PUT a raw image body (png/jpg/gif/webp) — the server resizes
// it to a 128×128 transparent WebP and stores it as base64. DELETE resets to the
// provider default. Both broadcast for a live refresh.
one.put('/icon', async c => {
  const ws = c.get('ws')
  const bytes = new Uint8Array(await c.req.arrayBuffer())
  if (bytes.length === 0) return c.text('Empty image body', 400)
  let icon: string
  try {
    icon = await processIcon(bytes)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return c.text(`Invalid image: ${msg}`, 400)
  }
  await setWorkspaceConfig(ws.path, { icon })
  publishMei({ type: 'workspace:updated' })
  return c.json({ icon })
})

one.delete('/icon', async c => {
  await setWorkspaceConfig(c.get('ws').path, { icon: null })
  publishMei({ type: 'workspace:updated' })
  return c.body(null, 204)
})

// All info about a single workspace: its persisted layout (widget grid, chat
// mode, theme) plus server-resolved metadata. GET reads, PUT writes the layout,
// DELETE unregisters.
one.get('/', async c => {
  const ws = c.get('ws')
  const layout = await loadLayout(ws.path)
  return c.json({
    ...layout,
    // Resolved display name: the settings override, or the folder name.
    name: layout.name || basename(ws.path),
    cwd: ws.path,
    provider: ws.type,
    agentId: ws.agentId
  })
})

one.put('/', async c => {
  const ws = c.get('ws')
  const body = await c.req.json()
  if (!body || body.version !== 1) return c.text('Bad request', 400)
  // Preserve server-owned identity (name/icon) across a grid/theme save so the
  // client's PUT can't erase a `moi config`-set name. See mergeLayoutForSave.
  const existing = await loadLayout(ws.path)
  await saveLayout(mergeLayoutForSave(existing, body), ws.path)
  return c.body(null, 204)
})

one.delete('/', async c => {
  const ok = await removeWorkspace(c.req.param('id'))
  if (!ok) return c.text('Workspace not found', 404)
  return c.body(null, 204)
})

// ---- workspace collection: /api/workspaces ----------------------------------
const workspaces = new Hono<ApiEnv>()

workspaces.get('/', async c => {
  // Merge each workspace's live layout name/icon over the registry snapshot so
  // the sidebar reflects `moi config` changes immediately.
  const entries = await listWorkspaces()
  const merged = await Promise.all(
    entries.map(async e => {
      const layout = await loadLayout(e.path)
      return { ...e, name: layout.name ?? e.name, icon: layout.icon }
    })
  )
  return c.json(merged)
})

workspaces.post('/', async c => {
  const body = await c.req.json()
  if (!body?.path) return c.text('Missing path', 400)
  const rawType = body?.type
  const type = rawType === 'claude-code' || rawType === 'openclaw' ? rawType : undefined
  const entry = await registerWorkspace(String(body.path), {
    type,
    name: typeof body?.name === 'string' ? body.name : undefined,
    agentId: typeof body?.agentId === 'string' ? body.agentId : undefined,
    isDefault: typeof body?.isDefault === 'boolean' ? body.isDefault : undefined,
    lastRunAt: typeof body?.lastRunAt === 'string' ? body.lastRunAt : undefined
  })
  return c.json(entry, 201)
})

workspaces.get('/discover', async c => c.json(await discoverWorkspaces()))

// `/:id` is registered after the static `/discover` so the literal path wins.
// `/api/workspaces/ws` (the live-event WebSocket) is intercepted by Bun's routes
// table before it ever reaches Hono, so it never collides with `:id`.
workspaces.route('/:id', one)

// ---- top-level API ----------------------------------------------------------
export const api = new Hono()

api.route('/api/workspaces', workspaces)

// Legacy widget RPC. Superseded by `/api/workspaces/:id/rpc/*` (bundles now bake
// the workspace API base via sentinel). Kept so any bundle compiled before that
// route — still on disk, not yet rebuilt — keeps working.
api.post('/_rpc/:wid/fn/*', async c => {
  const wid = c.req.param('wid')
  const ws = await getWorkspace(wid)
  if (!ws) return c.text('Workspace not found', 404)
  const prefix = `/_rpc/${wid}/fn/`
  const tail = new URL(c.req.url).pathname.slice(prefix.length)
  return handleFunctionCall(c.req.raw, tail, ws.path)
})

// Everything else: a prebuilt hashed asset from `dist/` in prod (/chunk-….js,
// /favicon-….png, …), or 404. No-op in dev — the live bundler serves assets via
// the HTML route before Bun's fetch ever delegates here.
api.get('*', async c => (await serveDistAsset(c.req.path)) ?? c.text('Not found', 404))
api.notFound(c => c.text('Not found', 404))
