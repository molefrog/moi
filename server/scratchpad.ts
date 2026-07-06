import { join } from 'path'

import tldrawPkg from 'tldraw/package.json'

import type { ScratchpadWriter } from '@/lib/types'

import moiPkg from '../package.json'

// The Scratchpad is a shared tldraw canvas per workspace, persisted as a tldraw
// *document* snapshot here (the per-tab `session` is intentionally dropped). Two
// writers: the browser autosaves on user edits, and the server writes on agent
// draws (see scratchpad-executor.ts). This module owns the on-disk shape: load,
// save, and the `moi scratch read` parser. See docs/moi-scratchpad.md.

// A tldraw document snapshot: `getSnapshot(store).document`. Opaque to us apart
// from `.store` (the record map) which `read` walks. `null` means empty canvas.
export type ScratchpadDoc = { store?: Record<string, unknown>; schema?: unknown }
export type ScratchpadSnapshot = { document: ScratchpadDoc | null; writer?: ScratchpadWriter }

// This process's identity as a snapshot writer. The tldraw version is what
// matters for compatibility (the snapshot embeds its schema); the moi version is
// what a user can actually act on ("update moi"). Both resolve from this
// install's own package.json files, so they're correct in the repo-source and
// installed layouts alike.
export const SCRATCHPAD_WRITER: ScratchpadWriter = {
  moi: moiPkg.version,
  tldraw: tldrawPkg.version
}

// One shape as surfaced by `moi scratch read` — a compact, agent-friendly view.
export type ScratchShape = {
  id: string
  type: string
  x: number
  y: number
  w?: number
  h?: number
  text?: string
  // Image/asset src. Base64 data URLs are omitted (see omitBase64) — the agent
  // calls `moi scratch view` to actually see pixels; only the URL kind passes through.
  src?: string
}

// The snapshot is a hidden dotfile (like `.moi/.workspace.json`): it's moi-internal
// state, and the agent must read it only through `moi scratch read`, never by
// opening the file.
export function getScratchpadPath(workspacePath: string): string {
  return join(workspacePath, '.moi', '.scratchpad.json')
}

// The writer stamp is trusted only off disk — we wrote it (saveScratchpadDoc
// stamps every save); a client PUT body never carries one through.
function parseWriter(value: unknown): ScratchpadWriter | undefined {
  if (!value || typeof value !== 'object') return undefined
  const w = value as { moi?: unknown; tldraw?: unknown }
  if (typeof w.moi !== 'string' || typeof w.tldraw !== 'string') return undefined
  return { moi: w.moi, tldraw: w.tldraw }
}

export async function loadScratchpadDoc(workspacePath: string): Promise<ScratchpadSnapshot> {
  try {
    const text = await Bun.file(getScratchpadPath(workspacePath)).text()
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && parsed.document) {
      return { document: parsed.document as ScratchpadDoc, writer: parseWriter(parsed.writer) }
    }
  } catch {}
  return { document: null }
}

export async function saveScratchpadDoc(
  document: ScratchpadDoc,
  workspacePath: string
): Promise<void> {
  const path = getScratchpadPath(workspacePath)
  await backupOnSchemaChange(path, document)
  await Bun.write(path, JSON.stringify({ document, writer: SCRATCHPAD_WRITER }, null, 2))
}

// When a save is about to overwrite a snapshot with a *different* schema (i.e.
// the first write after a tldraw upgrade), keep the old file as `.bak` — the
// manual escape hatch after a downgrade, since the new file won't open in the
// older tldraw. One .bak, replaced on each schema change. Best-effort: a backup
// failure must never block the save.
async function backupOnSchemaChange(path: string, document: ScratchpadDoc): Promise<void> {
  try {
    const existing = JSON.parse(await Bun.file(path).text()) as { document?: ScratchpadDoc }
    const oldSchema = existing?.document?.schema
    if (!oldSchema || JSON.stringify(oldSchema) === JSON.stringify(document.schema)) return
    await Bun.write(`${path}.bak`, Bun.file(path))
  } catch {}
}

// tldraw embeds pasted/dropped images as `data:<mime>;base64,<blob>` URLs (on
// asset records, and occasionally inline in rich text). Those blobs are huge and
// useless for reasoning about structure, so we replace each one with a short
// marker — the agent calls `moi scratch view` when it actually needs the pixels.
// Non-base64 srcs (e.g. https URLs) pass through untouched.
const BASE64_DATA_URL_RE = /data:[\w.+-]*\/?[\w.+-]*;base64,[A-Za-z0-9+/=]+/g
function omitBase64(text: string): string {
  return text.replace(BASE64_DATA_URL_RE, 'base64:omitted')
}

// Pull readable text out of a shape's props. tldraw stores labels as `richText`
// (a ProseMirror-style doc) on most shapes; older/simple shapes may use a flat
// `text` string. Best-effort — never throw on an unexpected shape.
function extractText(props: unknown): string | undefined {
  if (!props || typeof props !== 'object') return undefined
  const p = props as { text?: unknown; richText?: unknown }
  if (typeof p.text === 'string' && p.text.length > 0) return p.text
  if (p.richText) {
    const out: string[] = []
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return
      const n = node as { type?: string; text?: unknown; content?: unknown }
      if (n.type === 'text' && typeof n.text === 'string') out.push(n.text)
      if (Array.isArray(n.content)) n.content.forEach(walk)
    }
    walk(p.richText)
    const joined = out.join('').trim()
    if (joined.length > 0) return joined
  }
  return undefined
}

// Resolve a single image shape's source by id, straight off the disk snapshot —
// no browser. The shape references an `asset` record by `props.assetId`; we return
// that asset's `src` (a `data:` URL for pasted/dropped images, or an `https:` URL).
// `moi scratch read` deliberately omits these blobs, so this is how the agent pulls
// the actual pixels for one image. Ids match with or without the `shape:` prefix
// (read surfaces them stripped).
export async function readScratchpadImage(
  workspacePath: string,
  id: string
): Promise<{ src: string } | { error: string }> {
  const { document } = await loadScratchpadDoc(workspacePath)
  const store = document?.store
  if (!store || typeof store !== 'object') return { error: `No shape named "${id}"` }

  const target = id.replace(/^shape:/, '')
  let assetId: string | undefined
  let found = false
  for (const record of Object.values(store)) {
    if (!record || typeof record !== 'object') continue
    const r = record as { typeName?: string; id?: string; props?: { assetId?: unknown } }
    if (r.typeName !== 'shape' || (r.id ?? '').replace(/^shape:/, '') !== target) continue
    found = true
    if (typeof r.props?.assetId === 'string') assetId = r.props.assetId
    break
  }
  if (!found) return { error: `No shape named "${id}"` }
  if (!assetId) return { error: `Shape "${id}" is not an image` }

  for (const record of Object.values(store)) {
    if (!record || typeof record !== 'object') continue
    const a = record as { typeName?: string; id?: string; props?: { src?: unknown } }
    if (a.typeName === 'asset' && a.id === assetId && typeof a.props?.src === 'string') {
      return { src: a.props.src }
    }
  }
  return { error: `Image "${id}" has no stored data` }
}

// no browser needed. Ids are reported without tldraw's `shape:` prefix so they
// round-trip with `createShapeId(name)` on the draw side.
export async function readScratchpadShapes(workspacePath: string): Promise<ScratchShape[]> {
  const { document } = await loadScratchpadDoc(workspacePath)
  const store = document?.store
  if (!store || typeof store !== 'object') return []

  // Images live as `asset` records (typeName 'asset'); a shape references one by
  // `props.assetId`. Index asset src first so we can surface it on the shape —
  // with base64 blobs omitted — without dumping the asset record itself.
  const assetSrc = new Map<string, string>()
  for (const record of Object.values(store)) {
    if (!record || typeof record !== 'object') continue
    const a = record as { typeName?: string; id?: string; props?: { src?: unknown } }
    if (a.typeName !== 'asset' || typeof a.id !== 'string') continue
    if (typeof a.props?.src === 'string') assetSrc.set(a.id, a.props.src)
  }

  const shapes: ScratchShape[] = []
  for (const record of Object.values(store)) {
    if (!record || typeof record !== 'object') continue
    const r = record as {
      typeName?: string
      id?: string
      type?: string
      x?: number
      y?: number
      props?: { w?: unknown; h?: unknown; assetId?: unknown }
    }
    if (r.typeName !== 'shape') continue
    const w = typeof r.props?.w === 'number' ? r.props.w : undefined
    const h = typeof r.props?.h === 'number' ? r.props.h : undefined
    const rawSrc = typeof r.props?.assetId === 'string' ? assetSrc.get(r.props.assetId) : undefined
    shapes.push({
      id: (r.id ?? '').replace(/^shape:/, ''),
      type: r.type ?? 'unknown',
      x: typeof r.x === 'number' ? r.x : 0,
      y: typeof r.y === 'number' ? r.y : 0,
      ...(w !== undefined ? { w } : {}),
      ...(h !== undefined ? { h } : {}),
      ...(() => {
        const text = extractText(r.props)
        return text !== undefined ? { text: omitBase64(text) } : {}
      })(),
      ...(rawSrc !== undefined ? { src: omitBase64(rawSrc) } : {})
    })
  }
  return shapes
}
