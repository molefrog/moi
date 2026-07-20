import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { createMiddleware } from 'hono/factory'
import { existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import type {
  HarnessAvailability,
  UploadInfo,
  ViewBuilderInput,
  WorkspaceEntry,
  WorkspaceModels,
  WorkspaceType
} from '@/lib/types'
import { appendViewBuilderMeta } from '@/lib/view-builder-meta'

import { appletForModule, recordAppletError } from './applet-log'
import { apiBaseFor, parseAppletTail, serveWorkspaceFile } from './applets'
import { applyEnvChanged } from './env-apply'
import { publishEvent } from './events'
import { callFunction, parseFunctionPath } from './functions'
import { processIcon } from './icon'
import {
  getWorkspacePreview,
  loadLayout,
  mergeLayoutForSave,
  saveLayout,
  saveWidgetThumbnails
} from './layout'
import { getUserMcpStatus } from './harness/claude-code/mcp'
import { getClientFrameLog, getWireLog } from './harness/debug'
import { allHarnesses, harnessFor, isHarnessType } from './harness/registry'
import {
  discoverWorkspace,
  discoverWorkspaces,
  getWorkspace,
  listWorkspaces,
  registerWorkspace,
  removeWorkspace,
  reorderWorkspaces,
  tildify
} from './registry'
import { loadScratchpadDoc, saveScratchpadDoc } from './scratchpad'
import { MAX_ASSET_BYTES, scratchpadAssetFile, storeScratchpadAsset } from './scratchpad-assets'
import { DIST_DIR, prebuilt } from './static'
import { getThreadConfig, saveThreadConfig } from './thread-config'
import type { ThreadConfigPatch } from './thread-config'
import { serveWorkspaceImagePreview } from './preview'
import { MAX_UPLOAD_BYTES, addUpload, getUpload } from './uploads'
import { requiredEnvFor } from './required-env'
import { getViewList, listViews, serveView } from './views'
import {
  ViewBuilderError,
  beginViewBuilder,
  createViewBuilder,
  deleteViewBuilder,
  markViewBuilderWaiting,
  reconcileViewBuilders,
  updateViewBuilderInput
} from './view-builders'
import { listWidgets, serveWidget } from './widgets'
import { getWorkspaceConfig, setWorkspaceConfig } from './workspace-config'
import {
  CREATED_WORKSPACES_ROOT,
  provisionWorkspace,
  validateWorkspaceFolderName
} from './workspace-init'
import { resolveWorkspaceImportMetadata } from './workspace-import'
import type { WorkspaceImportMetadata } from './workspace-import'
import { getWorkspaceEnvView, isValidEnvKey, updateWorkspaceEnv } from './workspace-env'
import type { EnvUpdate } from './workspace-env'

// The resolved workspace is stashed on the context by `withWorkspace`, so every
// `/api/workspaces/:id/*` handler can read it without re-querying the registry.
type ApiEnv = { Variables: { ws: WorkspaceEntry } }

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
    return new Response(result, {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    // Journal the failure so the agent can find it via `moi debug logs` — the
    // 500 body below only reaches the browser (see docs/self-correction.md).
    recordAppletError(workspacePath, {
      source: 'rpc',
      ...(appletForModule(module) ?? {}),
      module,
      fn: name,
      message
    })
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
  const ws = c.get('ws')
  return c.json(
    await getWorkspacePreview(ws.path, includeFirstUserMessage =>
      harnessFor(ws).workspacePreview(ws, includeFirstUserMessage)
    )
  )
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
  return serveWidget(name, file, c.get('ws').path, apiBaseFor(id), c.req.header('if-none-match'))
})

// Views — full-screen agent apps. Mirrors the widget pair above: the exact path
// lists (in manifest/nav order), `/*` serves one bundle file.
one.get('/views', c => listViews(c.get('ws').path))

one.get('/views/*', c => {
  const id = c.req.param('id')
  const { name, file } = parseAppletTail(c.req.url, id, 'views')
  if (!name) return c.text('Not found', 404)
  return serveView(name, file, c.get('ws').path, apiBaseFor(id), c.req.header('if-none-match'))
})

function viewBuilderError(err: unknown): { message: string; status: 400 | 404 | 409 } | null {
  return err instanceof ViewBuilderError ? { message: err.message, status: err.status } : null
}

function parseAvailableViewIcons(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const icons = value.filter(
    (icon): icon is string =>
      typeof icon === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(icon) && icon.length <= 64
  )
  return icons.length > 0 ? [...new Set(icons)] : null
}

one.get('/view-builders', async c => {
  const ws = c.get('ws')
  const activeSessionIds = new Set(
    allHarnesses()
      .flatMap(h => h.activeSessions())
      .filter(session => session.workspaceId === ws.id)
      .map(session => session.sessionId)
  )
  const builders = await reconcileViewBuilders(
    ws.id,
    ws.path,
    await getViewList(ws.path),
    activeSessionIds
  )
  // Widget builders are record-only for now — reconciled server-side but kept
  // out of the host's view-builder tab list until their UI lands.
  return c.json({ builders: builders.filter(builder => builder.kind !== 'widget') })
})

one.post('/view-builders', async c => {
  const ws = c.get('ws')
  return c.json(await createViewBuilder(ws.id, ws.path), 201)
})

one.patch('/view-builders/:builderId', async c => {
  const ws = c.get('ws')
  const body = await c.req.json<{ input?: Partial<ViewBuilderInput> }>()
  if (typeof body?.input?.requirements !== 'string') {
    return c.text('Expected { input: { requirements: string } }', 400)
  }
  try {
    return c.json(
      await updateViewBuilderInput(
        ws.id,
        ws.path,
        c.req.param('builderId'),
        body.input.requirements
      )
    )
  } catch (err) {
    const known = viewBuilderError(err)
    if (known) return c.text(known.message, known.status)
    throw err
  }
})

one.post('/view-builders/:builderId/submit', async c => {
  const ws = c.get('ws')
  const body = await c.req.json<{
    input?: Partial<ViewBuilderInput>
    optimisticId?: string
    model?: string
    effort?: string
    stream?: boolean
    availableIcons?: unknown
  }>()
  if (typeof body?.input?.requirements !== 'string') {
    return c.text('Expected { input: { requirements: string } }', 400)
  }
  if (body.optimisticId !== undefined && typeof body.optimisticId !== 'string') {
    return c.text('Invalid optimisticId', 400)
  }
  const availableIcons = parseAvailableViewIcons(body.availableIcons)
  if (!availableIcons) return c.text('Available view icons are required', 400)
  try {
    const builder = await beginViewBuilder(
      ws.id,
      ws.path,
      c.req.param('builderId'),
      body.input.requirements
    )
    const content = appendViewBuilderMeta(builder.input.requirements, builder.id, availableIcons)
    try {
      await harnessFor(ws).sendMessage({
        workspaceId: ws.id,
        workspacePath: ws.path,
        sessionId: builder.sessionId,
        isNew: true,
        content,
        optimisticId: body.optimisticId,
        model: typeof body.model === 'string' ? body.model : undefined,
        effort: typeof body.effort === 'string' ? body.effort : undefined,
        stream: body.stream === true ? true : undefined,
        agentId: ws.agentId
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start view builder'
      await markViewBuilderWaiting(ws.id, ws.path, builder.id, message)
      return c.text(message, 500)
    }
    return c.json(builder)
  } catch (err) {
    const known = viewBuilderError(err)
    if (known) return c.text(known.message, known.status)
    throw err
  }
})

one.delete('/view-builders/:builderId', async c => {
  const ws = c.get('ws')
  try {
    await deleteViewBuilder(ws.id, ws.path, c.req.param('builderId'))
    return c.body(null, 204)
  } catch (err) {
    const known = viewBuilderError(err)
    if (known) return c.text(known.message, known.status)
    throw err
  }
})

// Workspace file stream — an applet's `fileUrl(path)` resolves here. Streams a
// media file from the workspace root (range-enabled). Guarded: traversal and
// dotfiles (`.env`, `.moi`, `.git`) are rejected and only media/asset extensions
// are allowed — the workspace holds secrets, and this route is unauthenticated.
// localhost binding is NOT the guard.
one.get('/fs/*', c => {
  const id = c.req.param('id')
  const tail = new URL(c.req.url).pathname.split(`/api/workspaces/${id}/fs/`)[1] ?? ''
  return serveWorkspaceFile(
    c.get('ws').path,
    tail,
    c.req.header('range'),
    c.req.header('if-none-match')
  )
})

// Applet RPC — the home for server-function calls from a bundle. The bundle's
// sentinel base resolves to `/api/workspaces/<id>`, so it POSTs to
// `…/rpc/<module>/<fn>`.
one.post('/rpc/*', c => {
  const id = c.req.param('id')
  const tail = new URL(c.req.url).pathname.split(`/api/workspaces/${id}/rpc/`)[1] ?? ''
  return handleFunctionCall(c.req.raw, tail, c.get('ws').path)
})

// Browser-side applet errors (module load failures, render crashes, window
// errors attributed to a bundle) reported into the workspace's error journal —
// `moi debug logs` reads it back (docs/self-correction.md). Unauthenticated
// localhost route, so treat the payload as hostile: whitelist the browser-only
// sources (`build`/`rpc` are server-recorded and can't be spoofed by a tab),
// pattern-check the applet name, cap the batch size; applet-log.ts caps string
// lengths.
one.post('/applet-log', async c => {
  let body: { events?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.text('Invalid JSON', 400)
  }
  const events = Array.isArray(body.events) ? body.events.slice(0, 10) : []
  for (const raw of events) {
    const e = raw as {
      source?: unknown
      kind?: unknown
      name?: unknown
      message?: unknown
      stack?: unknown
    }
    if (e.source !== 'load' && e.source !== 'render' && e.source !== 'window') continue
    if (e.kind !== 'widget' && e.kind !== 'view') continue
    if (typeof e.name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(e.name)) continue
    if (typeof e.message !== 'string' || !e.message) continue
    recordAppletError(c.get('ws').path, {
      source: e.source,
      kind: e.kind,
      name: e.name,
      message: e.message,
      ...(typeof e.stack === 'string' ? { stack: e.stack } : {})
    })
  }
  return c.body(null, 204)
})

// Downscaled image preview of a workspace file. The chat's expanded tool rows
// use this to show the picture an agent `Read` — same guards as /fs/ above,
// images only, resized server-side (see server/preview.ts).
one.get('/preview/*', c => {
  const id = c.req.param('id')
  const tail = new URL(c.req.url).pathname.split(`/api/workspaces/${id}/preview/`)[1] ?? ''
  return serveWorkspaceImagePreview(c.get('ws').path, tail, c.req.header('if-none-match'))
})

// Chat attachments. The composer POSTs files here (drag/drop, paste, or the
// attach button) ahead of sending; we process + stash them and hand back opaque
// upload ids the chat WS frame references. Images are downscaled and inlined as
// vision blocks at send time; other files are referenced by a temp path. See
// server/uploads.ts and dev/file-uploads.md.
one.post('/uploads', async c => {
  const id = c.req.param('id')
  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    return c.text('Expected multipart/form-data', 400)
  }
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return c.text('No files', 400)
  if (files.length > 20) return c.text('Too many files (max 20)', 400)

  const out: UploadInfo[] = []
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return c.text(`"${file.name}" is too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB)`, 413)
    }
    try {
      const bytes = Buffer.from(await file.arrayBuffer())
      out.push(
        await addUpload({
          workspaceId: id,
          filename: file.name || 'file',
          mediaType: file.type || 'application/octet-stream',
          bytes
        })
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process upload'
      return c.text(`"${file.name}": ${message}`, 400)
    }
  }
  return c.json(out)
})

// Serve an upload's bytes back. Display parts reference this URL instead of a
// base64 data URL so the transcript broadcast / client cache stay small. The id
// is content-addressed (sha256), so the response is immutable while it lives —
// let the browser cache it for the store's TTL.
one.get('/uploads/:uploadId', c => {
  const u = getUpload(c.req.param('id'), c.req.param('uploadId'))
  if (!u) return c.text('Not found or expired', 404)
  const body: BodyInit | null = u.data ?? (u.path ? Bun.file(u.path) : null)
  if (!body) return c.text('Not found or expired', 404)
  return new Response(body, {
    headers: {
      'Content-Type': u.mediaType,
      'Content-Disposition': `inline; filename="${u.filename.replaceAll('"', '')}"`,
      'Cache-Control': 'private, max-age=1800, immutable'
    }
  })
})

one.get('/sessions', async c => {
  const ws = c.get('ws')
  return c.json(await harnessFor(ws).listSessions(ws))
})

one.get('/sessions/:sessionId/events', async c => {
  const ws = c.get('ws')
  return c.json(await harnessFor(ws).sessionEvents(ws, c.req.param('sessionId')))
})

// Per-thread agent settings (model + reasoning effort). GET returns the stored
// config ({} for threads that never overrode the workspace defaults); PUT patches
// it (a field as `null` clears it, omitted leaves it). The change takes effect on
// the thread's next message — see ClientMessage/effort handling in cc-session.
one.get('/sessions/:sessionId/config', async c => {
  return c.json(await getThreadConfig(c.get('ws').path, c.req.param('sessionId')))
})

one.put('/sessions/:sessionId/config', async c => {
  const body = await c.req.json().catch(() => null)
  if (typeof body !== 'object' || body === null) {
    return c.text('Expected a JSON object', 400)
  }
  const patch: ThreadConfigPatch = {}
  const record = body as Record<string, unknown>
  for (const key of ['model', 'effort'] as const) {
    if (!(key in record)) continue
    const value = record[key]
    if (value !== null && typeof value !== 'string') {
      return c.text(`${key} must be a string or null`, 400)
    }
    patch[key] = value
  }
  return c.json(await saveThreadConfig(c.get('ws').path, c.req.param('sessionId'), patch))
})

one.get('/mcp', async c => {
  const ws = c.get('ws')
  return c.json((await harnessFor(ws).mcpStatus?.(ws)) ?? [])
})

// Harness debug tap for /playground/harness: the backend's native wire frames
// (Codex: app-server JSON-RPC, both directions; Claude Code: raw SDK messages
// + enqueued inputs) and the exact frames the server pushed to chat clients.
// `sinceWire`/`sinceBroadcast` are seq cursors so the page can poll deltas.
one.get('/harness/debug', async c => {
  const ws = c.get('ws')
  const harness = harnessFor(ws)
  const sinceWire = Number(c.req.query('sinceWire') ?? 0) || 0
  const sinceBroadcast = Number(c.req.query('sinceBroadcast') ?? 0) || 0
  return c.json({
    provider: harness.id,
    process: (await harness.debugInfo?.(ws)) ?? null,
    wire: getWireLog(harness.wireScope?.(ws) ?? ws.id, sinceWire),
    broadcasts: getClientFrameLog(ws.id, sinceBroadcast)
  })
})

// Per-workspace env vars. GET returns the effective view (discovered `.env` + UI
// custom secrets + scopes + declared-required keys; values masked).
one.get('/env', async c => {
  const ws = c.get('ws')
  // Unawaited on purpose: getWorkspaceEnvView loads it in parallel with the
  // env stores (manifest reads and env reads are independent).
  return c.json(await getWorkspaceEnvView(ws.path, requiredEnvFor(ws.path)))
})

// PUT patches custom secrets (set/remove) and/or the inheritDotenv mode,
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
  if (body.inheritDotenv !== undefined) {
    if (typeof body.inheritDotenv !== 'boolean') {
      return c.text('inheritDotenv must be a boolean', 400)
    }
    patch.inheritDotenv = body.inheritDotenv
  }

  // Skip the write + reaps for a no-op PUT (no recognized fields) so an empty
  // body doesn't needlessly kill warm workers / idle sessions.
  const hasChange =
    patch.set !== undefined || patch.remove !== undefined || patch.inheritDotenv !== undefined
  if (hasChange) {
    await updateWorkspaceEnv(ws.path, patch)
    // Frozen-at-spawn: reap workers/idle sessions and tell other clients.
    applyEnvChanged(ws)
  }

  return c.json(await getWorkspaceEnvView(ws.path, requiredEnvFor(ws.path)))
})

// Is the workspace's agent backend usable right now? (e.g. a codex workspace
// on a machine without the codex CLI). The chat surfaces the `reason` as a
// banner instead of letting the first send fail cold.
one.get('/availability', async c => {
  const harness = harnessFor(c.get('ws'))
  const availability = (await harness.availability?.()) ?? { available: true }
  return c.json(availability satisfies HarnessAvailability)
})

// Models the workspace's agent backend can run, normalized across providers.
// OpenClaw queries the gateway catalog; everything else (Claude Code) reads the
// account-wide Agent SDK model list.
one.get('/models', async c => {
  const ws = c.get('ws')
  const harness = harnessFor(ws)
  // A backend that can't answer (codex CLI missing, gateway down) degrades to
  // an empty catalog — the picker hides and chat surfaces the real problem via
  // the availability banner, instead of this endpoint 500ing on page load.
  const models = await harness.listModels(ws).catch(err => {
    console.error(`[api] listModels failed for ${harness.id}`, err)
    return []
  })
  return c.json({
    provider: harness.id,
    models,
    supportsStreaming: harness.capabilities.supportsStreaming
  } satisfies WorkspaceModels)
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
  publishEvent({ type: 'workspace:updated' })
  return c.json(await getWorkspaceConfig(ws.path))
})

// Scratchpad canvas. GET returns the persisted tldraw document snapshot
// ({ document } or { document: null } when empty) for hydration; PUT saves a new
// snapshot ({ document, origin }) and broadcasts so other open tabs reload.
// `origin` is the writing tab's id — echoed in the broadcast so that tab can
// ignore its own save. This is the browser's write path; the agent's draws are
// written server-side (see scratchpad-executor.ts). See docs/moi-scratchpad.md.
one.get('/scratchpad', async c => {
  return c.json(await loadScratchpadDoc(c.get('ws').path))
})

one.put('/scratchpad', async c => {
  const ws = c.get('ws')
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object' || !body.document) {
    return c.text('Expected { document }', 400)
  }
  await saveScratchpadDoc(body.document, ws.path)
  publishEvent({
    type: 'scratchpad:updated',
    workspaceId: c.req.param('id'),
    origin: typeof body.origin === 'string' ? body.origin : undefined
  })
  return c.body(null, 204)
})

// Scratchpad assets: pasted/dropped image bytes live as content-addressed files
// in `.moi/.scratchpad/`, referenced from the snapshot by `asset:` srcs —
// never inlined as base64 in the JSON (see server/scratchpad-assets.ts). The
// browser's TLAssetStore POSTs the raw file here on paste and resolves `asset:`
// srcs back through the GET when rendering.
one.post('/scratchpad/assets', async c => {
  const length = Number(c.req.header('content-length') ?? 0)
  if (length > MAX_ASSET_BYTES) {
    return c.text(`Asset too large (max ${MAX_ASSET_BYTES / (1024 * 1024)} MB)`, 413)
  }
  const bytes = new Uint8Array(await c.req.arrayBuffer())
  if (bytes.length === 0) return c.text('Empty body', 400)
  if (bytes.length > MAX_ASSET_BYTES) {
    return c.text(`Asset too large (max ${MAX_ASSET_BYTES / (1024 * 1024)} MB)`, 413)
  }
  const mimeType = c.req.header('content-type') ?? 'application/octet-stream'
  return c.json(await storeScratchpadAsset(c.get('ws').path, bytes, mimeType))
})

// The file name is content-addressed (sha256 of the bytes), so a hit is
// immutable — let the browser cache it indefinitely.
one.get('/scratchpad/assets/:file', async c => {
  const resolved = scratchpadAssetFile(c.get('ws').path, c.req.param('file'))
  if (!resolved || !(await resolved.file.exists())) return c.text('Not found', 404)
  return new Response(resolved.file, {
    headers: {
      'Content-Type': resolved.mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Assets are only ever consumed via <img>/<video>/fetch (which all ignore
      // this), so force a download on direct navigation and block MIME sniffing:
      // a pasted/uploaded SVG must not execute as script in the app origin.
      'Content-Disposition': 'attachment',
      'X-Content-Type-Options': 'nosniff'
    }
  })
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
  publishEvent({ type: 'workspace:updated' })
  return c.json({ icon })
})

one.delete('/icon', async c => {
  await setWorkspaceConfig(c.get('ws').path, { icon: null })
  publishEvent({ type: 'workspace:updated' })
  return c.body(null, 204)
})

// All info about a single workspace: its persisted layout (widget grid, layout
// mode, theme) plus server-resolved metadata. GET reads, PUT writes the layout,
// DELETE unregisters.
one.get('/', async c => {
  const ws = c.get('ws')
  // The thumbnail images are heavy (base64 WebPs) and have their own write
  // path (PUT .../thumbnails); the layout ships `widgetThumbnails` without
  // them — just `key`/`at`, which clients compare against the live grid to
  // decide when to re-capture.
  const { widgetThumbnails, ...layout } = await loadLayout(ws.path)
  return c.json({
    ...layout,
    ...(widgetThumbnails && {
      widgetThumbnails: { key: widgetThumbnails.key, at: widgetThumbnails.at }
    }),
    // Resolved display name: the settings override, or the folder name.
    name: layout.name || basename(ws.path),
    cwd: ws.path,
    provider: ws.type,
    agentId: ws.agentId
  })
})

// Widget thumbnails: a separate write path from the layout PUT below, so grid
// and theme saves never round-trip the base64 map (and this save can't touch
// the grid). Still lands in `.workspace.json` under the hood. Entries merge
// over the stored map; `key` fingerprints the grid state they were captured
// from (see widgetThumbnailsKey() on the client).
one.put('/thumbnails', async c => {
  const body: unknown = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.text('Bad request', 400)
  const { key, thumbnails } = body as { key?: unknown; thumbnails?: unknown }
  const validMap =
    thumbnails !== null &&
    typeof thumbnails === 'object' &&
    Object.values(thumbnails as Record<string, unknown>).every(v => typeof v === 'string')
  if (typeof key !== 'string' || !validMap) return c.text('Bad request', 400)
  await saveWidgetThumbnails(c.get('ws').path, key, thumbnails as Record<string, string>)
  return c.body(null, 204)
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

async function mergeWorkspaceList(entries: WorkspaceEntry[]) {
  return Promise.all(
    entries.map(async e => {
      const layout = await loadLayout(e.path)
      return { ...e, name: layout.name ?? e.name, icon: layout.icon }
    })
  )
}

workspaces.get('/', async c => {
  // Merge each workspace's live layout name/icon over the registry snapshot so
  // the sidebar reflects `moi config` changes immediately.
  const entries = await listWorkspaces()
  return c.json(await mergeWorkspaceList(entries))
})

workspaces.put('/order', async c => {
  const body = await c.req.json()
  if (!Array.isArray(body?.ids) || body.ids.some((id: unknown) => typeof id !== 'string')) {
    return c.text('Expected { ids: string[] }', 400)
  }
  try {
    const entries = await reorderWorkspaces(body.ids)
    // List-only change: a narrow event so clients refetch just the sidebar
    // list, not every per-workspace query (`workspace:updated` also triggers
    // layout refetches in open workspaces).
    publishEvent({ type: 'workspaces-list:updated' })
    return c.json(await mergeWorkspaceList(entries))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.text(message, 400)
  }
})

workspaces.post('/', async c => {
  const body = await c.req.json()
  if (!body?.path) return c.text('Missing path', 400)
  const requestedType: unknown = body?.type ?? 'claude-code'
  if (!isHarnessType(requestedType)) return c.text('Unknown workspace type', 400)
  const type: WorkspaceType = requestedType
  const path = resolve(String(body.path))
  let metadata: WorkspaceImportMetadata
  try {
    metadata = await resolveWorkspaceImportMetadata(path, type)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.text(message, 400)
  }
  // Importing IS initializing: lay down the bundled skills (in the backend's
  // skills dir) and the `.moi/` scaffold, exactly like `moi init` — a workspace
  // added from the UI must be indistinguishable from one added via the CLI.
  try {
    await provisionWorkspace(path, type)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.text(`Could not initialize workspace: ${message}`, 500)
  }
  const entry = await registerWorkspace(path, {
    type,
    ...metadata
  })
  return c.json(entry, 201)
})

workspaces.get('/discover', async c => c.json(await discoverWorkspaces()))

// Backends the create dialog can provision from scratch. OpenClaw workspaces
// belong to their agents and arrive via discovery.
const CREATABLE_TYPES = new Set<WorkspaceType>(['claude-code', 'codex'])

// Per-backend runtime availability (e.g. is the codex CLI installed?), keyed
// by workspace type. Harnesses without the hook are always available.
async function harnessAvailability(): Promise<Record<string, HarnessAvailability>> {
  const out: Record<string, HarnessAvailability> = {}
  for (const h of allHarnesses()) {
    out[h.id] = h.availability ? await h.availability() : { available: true }
  }
  return out
}

// Where `/workspace/create` places new folders — the client shows the resolved
// location while the user types a name. `canChooseFolder` tells the UI whether
// the native folder picker is available (macOS only for now). `availability`
// lets the dialog disable backends whose runtime is missing.
workspaces.get('/create', async c =>
  c.json({
    root: CREATED_WORKSPACES_ROOT,
    displayRoot: tildify(CREATED_WORKSPACES_ROOT),
    canChooseFolder: process.platform === 'darwin',
    availability: await harnessAvailability()
  })
)

// Create a brand-new workspace: a fresh folder under CREATED_WORKSPACES_ROOT,
// provisioned (skills + `.moi/` scaffold) and registered.
workspaces.post('/create', async c => {
  const body = await c.req.json()
  const requestedType: unknown = body?.type ?? 'claude-code'
  if (!isHarnessType(requestedType)) {
    return c.text('Unknown workspace type', 400)
  }
  const type: WorkspaceType = requestedType
  if (!CREATABLE_TYPES.has(type)) {
    return c.text('Workspaces of this type arrive through discovery, not creation', 400)
  }
  const availability = await (harnessFor(type).availability?.() ??
    Promise.resolve({ available: true as const }))
  if (!availability.available) return c.text(availability.reason, 400)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const invalid = validateWorkspaceFolderName(name)
  if (invalid) return c.text(invalid, 400)
  const path = join(CREATED_WORKSPACES_ROOT, name)
  if (existsSync(path)) return c.text('A folder with that name already exists', 409)
  try {
    await provisionWorkspace(path, type)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.text(`Could not create workspace: ${message}`, 500)
  }
  const entry = await registerWorkspace(path, { type })
  // Nudge every connected client (the sidebar list) to refetch.
  publishEvent({ type: 'workspaces-list:updated' })
  return c.json(entry, 201)
})

// Guards against opening a second native picker while one is already up — a
// duplicate request (e.g. a quick re-click) resolves as canceled instead of
// spawning a second Finder dialog on top of the first.
let folderPickerOpen = false

export function isSameOriginRequest(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site')
  if (site === 'cross-site') return false
  // Modern browsers state the relationship directly — trust it. Reaching the
  // Origin fallback below with a full-origin comparison would 403 every request
  // behind a TLS-terminating proxy (Cloudflare Tunnel, nginx, ngrok — see
  // client/lib/ws-url.ts): the browser sends `https://…` while `req.url` is
  // built from the plain-HTTP listener.
  if (site === 'same-origin') return true
  const origin = req.headers.get('origin')
  if (!origin) return true
  // Older browsers without sec-fetch-site: compare hosts only, since the
  // scheme the browser saw is unknowable behind TLS termination.
  try {
    return new URL(origin).host === new URL(req.url).host
  } catch {
    return false
  }
}

// Open the OS-native folder picker so the user can choose an existing folder to
// import (the create dialog's "Use existing folder"). The server runs on the
// user's machine, so it can drive the real system dialog — the browser can't.
// Returns the same grouped provider discovery shape as `/discover`, or
// `{ canceled: true }` if the dialog is dismissed. macOS only for now.
workspaces.post('/choose-folder', async c => {
  if (!isSameOriginRequest(c.req.raw)) return c.text('Forbidden', 403)
  if (process.platform !== 'darwin') {
    return c.text('Choosing a folder is only supported on macOS for now', 400)
  }
  if (folderPickerOpen) return c.json({ canceled: true })
  folderPickerOpen = true
  try {
    // The picker is spawned by osascript, a background helper, so macOS won't
    // give it focus by default. `tell me to activate` forces the script runner
    // frontmost, and the short delay lets that settle before the panel opens so
    // it appears focused rather than behind other windows.
    const proc = Bun.spawn(
      [
        'osascript',
        '-e',
        'tell me to activate',
        '-e',
        'delay 0.2',
        '-e',
        'POSIX path of (choose folder with prompt "Select a project folder")'
      ],
      { stdout: 'pipe', stderr: 'pipe' }
    )
    const exitCode = await proc.exited
    // osascript exits non-zero when the user presses Cancel.
    if (exitCode !== 0) return c.json({ canceled: true })
    const path = (await new Response(proc.stdout).text()).trim()
    if (!path) return c.json({ canceled: true })
    return c.json(await discoverWorkspace(path))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.text(`Could not open the folder picker: ${message}`, 500)
  } finally {
    folderPickerOpen = false
  }
})

// `/:id` is registered after the static `/discover` so the literal path wins.
// `/api/workspaces/ws` (the live-event WebSocket) is intercepted by Bun's routes
// table before it ever reaches Hono, so it never collides with `:id`.
workspaces.route('/:id', one)

// ---- top-level API ----------------------------------------------------------
export const api = new Hono()

api.get('/api/mcp', async c => {
  return c.json(await getUserMcpStatus())
})

api.route('/api/workspaces', workspaces)

// Everything else: in production, serve the prebuilt client from `dist/` via
// Hono's static handler (mime types, traversal-safe, optional precompression).
// Hashed assets (`/chunk-….js`, `/favicon-….png`, …) are pinned immutable; the
// unhashed `index.html` is not. Never mounted in dev — the live bundler serves
// assets via the HTML route before Bun's `fetch` ever delegates here.
if (prebuilt) {
  api.get(
    '*',
    serveStatic({
      root: DIST_DIR,
      onFound: (path, c) => {
        c.header(
          'Cache-Control',
          path.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable'
        )
      }
    })
  )
}
api.notFound(c => c.text('Not found', 404))
