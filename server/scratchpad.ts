import { join } from 'path'

import { LABEL_FONT_SIZES, TEXT_FONT_SIZES, textBlockSize } from './scratchpad-metrics'

// The Scratchpad is a shared tldraw canvas per workspace, persisted as a tldraw
// *document* snapshot here (the per-tab `session` is intentionally dropped). Two
// writers: the browser autosaves on user edits, and the server writes on agent
// draws (see scratchpad-executor.ts). This module owns the on-disk shape: load,
// save, and the `moi scratch read` parser. See docs/moi-scratchpad.md.

// A tldraw document snapshot: `getSnapshot(store).document`. Opaque to us apart
// from `.store` (the record map) which `read` walks. `null` means empty canvas.
export type ScratchpadDoc = { store?: Record<string, unknown>; schema?: unknown }
export type ScratchpadSnapshot = { document: ScratchpadDoc | null }

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

export async function loadScratchpadDoc(workspacePath: string): Promise<ScratchpadSnapshot> {
  try {
    const text = await Bun.file(getScratchpadPath(workspacePath)).text()
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && parsed.document) {
      return { document: parsed.document as ScratchpadDoc }
    }
  } catch {}
  return { document: null }
}

export async function saveScratchpadDoc(
  document: ScratchpadDoc,
  workspacePath: string
): Promise<void> {
  await Bun.write(getScratchpadPath(workspacePath), JSON.stringify({ document }, null, 2))
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
// `text` string. Paragraph boundaries become newlines, so multi-line labels
// round-trip through measurement and rendering. Best-effort — never throw on an
// unexpected shape. Shared by `read`, the lint checks, and the renderer.
export function extractShapeText(props: unknown): string | undefined {
  if (!props || typeof props !== 'object') return undefined
  const p = props as { text?: unknown; richText?: unknown }
  if (typeof p.text === 'string' && p.text.length > 0) return p.text
  if (p.richText) {
    const out: string[] = []
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return
      const n = node as { type?: string; text?: unknown; content?: unknown }
      if (n.type === 'text' && typeof n.text === 'string') out.push(n.text)
      if (Array.isArray(n.content)) {
        n.content.forEach((child, i) => {
          walk(child)
          const c = child as { type?: string }
          if (c && c.type === 'paragraph' && i < (n.content as unknown[]).length - 1) {
            out.push('\n')
          }
        })
      }
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
        const text = extractShapeText(r.props)
        return text !== undefined ? { text: omitBase64(text) } : {}
      })(),
      ...(rawSrc !== undefined ? { src: omitBase64(rawSrc) } : {})
    })
  }
  return shapes
}

// ---- Richer snapshot access for the renderer and lint --------------------------

// One shape record, parsed off the disk snapshot with more of its props than the
// compact `read` view exposes: styling, alignment, label text, z-order. Like the
// rest of this module, the parsing knows the snapshot schema is tldraw-internal —
// callers must never read the file directly. `id` is stripped of the `shape:`
// prefix (matching `read` and `createShapeId` on the draw side); `props` stays
// raw and untyped, so consumers narrow just the fields they use.
export type ScratchRecord = {
  id: string
  type: string
  x: number
  y: number
  rotation: number
  // Fractional index — sorts lexicographically into z-order.
  index: string
  props: Record<string, unknown>
  text?: string
}

// An arrow terminal bound to a shape (ids stripped of their prefixes).
export type ScratchArrowBinding = { arrowId: string; targetId: string; terminal: 'start' | 'end' }

export type ScratchRecords = {
  shapes: ScratchRecord[]
  bindings: ScratchArrowBinding[]
  // assetId → src (data or https URL), for image shapes' `props.assetId`.
  assets: Map<string, string>
}

export async function readScratchpadRecords(workspacePath: string): Promise<ScratchRecords> {
  const { document } = await loadScratchpadDoc(workspacePath)
  const store = document?.store
  const out: ScratchRecords = { shapes: [], bindings: [], assets: new Map() }
  if (!store || typeof store !== 'object') return out

  for (const record of Object.values(store)) {
    if (!record || typeof record !== 'object') continue
    const r = record as {
      typeName?: string
      id?: string
      type?: string
      x?: number
      y?: number
      rotation?: number
      index?: string
      props?: Record<string, unknown>
      fromId?: string
      toId?: string
    }
    if (r.typeName === 'asset' && typeof r.id === 'string') {
      const src = (r.props as { src?: unknown } | undefined)?.src
      if (typeof src === 'string') out.assets.set(r.id, src)
      continue
    }
    if (r.typeName === 'binding' && r.type === 'arrow') {
      const terminal = (r.props as { terminal?: unknown } | undefined)?.terminal
      if (
        typeof r.fromId === 'string' &&
        typeof r.toId === 'string' &&
        (terminal === 'start' || terminal === 'end')
      ) {
        out.bindings.push({
          arrowId: r.fromId.replace(/^shape:/, ''),
          targetId: r.toId.replace(/^shape:/, ''),
          terminal
        })
      }
      continue
    }
    if (r.typeName !== 'shape') continue
    const props = r.props && typeof r.props === 'object' ? r.props : {}
    out.shapes.push({
      id: (r.id ?? '').replace(/^shape:/, ''),
      type: r.type ?? 'unknown',
      x: typeof r.x === 'number' ? r.x : 0,
      y: typeof r.y === 'number' ? r.y : 0,
      rotation: typeof r.rotation === 'number' ? r.rotation : 0,
      index: typeof r.index === 'string' ? r.index : 'a1',
      props,
      ...(() => {
        const text = extractShapeText(props)
        return text !== undefined ? { text } : {}
      })()
    })
  }
  return out
}

export type ScratchBounds = { x: number; y: number; w: number; h: number }

// tldraw's fixed sticky-note edge (NOTE_SIZE); notes have no w/h props.
const NOTE_SIZE = 200

// Axis-aligned bounds of one shape, without a browser: fixed props where tldraw
// stores them, measured text where it doesn't. Rotation is ignored (best-effort —
// lint geometry and the renderer's canvas bbox only need the unrotated frame).
// Arrows return null: their extent depends on resolved terminals, which the
// renderer computes itself.
export function scratchShapeBounds(shape: ScratchRecord): ScratchBounds | null {
  const p = shape.props as {
    w?: unknown
    h?: unknown
    growY?: unknown
    size?: unknown
    autoSize?: unknown
    segments?: unknown
  }
  const growY = typeof p.growY === 'number' ? p.growY : 0
  switch (shape.type) {
    case 'geo':
    case 'image': {
      const w = typeof p.w === 'number' ? p.w : 100
      const h = typeof p.h === 'number' ? p.h : 100
      return { x: shape.x, y: shape.y, w, h: h + growY }
    }
    case 'note':
      return { x: shape.x, y: shape.y, w: NOTE_SIZE, h: NOTE_SIZE + growY }
    case 'text': {
      // autoSize text flows to its natural line widths; the persisted `w` is
      // stale for headless-created shapes, so measure instead. Fixed-width text
      // wraps at `w`.
      const fontSize =
        TEXT_FONT_SIZES[typeof p.size === 'string' ? p.size : 'm'] ?? TEXT_FONT_SIZES.m
      const text = shape.text ?? ''
      const block =
        p.autoSize === false && typeof p.w === 'number'
          ? textBlockSize(text, fontSize, p.w)
          : textBlockSize(text, fontSize)
      const w = p.autoSize === false && typeof p.w === 'number' ? p.w : block.w
      return { x: shape.x, y: shape.y, w, h: block.h }
    }
    case 'draw': {
      // Freehand: the bbox of every segment point, offset by the shape origin.
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      const segments = Array.isArray(p.segments) ? p.segments : []
      for (const seg of segments) {
        const points = (seg as { points?: unknown })?.points
        if (!Array.isArray(points)) continue
        for (const pt of points) {
          const q = pt as { x?: unknown; y?: unknown }
          if (typeof q.x !== 'number' || typeof q.y !== 'number') continue
          minX = Math.min(minX, q.x)
          minY = Math.min(minY, q.y)
          maxX = Math.max(maxX, q.x)
          maxY = Math.max(maxY, q.y)
        }
      }
      if (minX === Infinity) return { x: shape.x, y: shape.y, w: 0, h: 0 }
      return { x: shape.x + minX, y: shape.y + minY, w: maxX - minX, h: maxY - minY }
    }
    case 'arrow':
      return null
    default: {
      // Unknown shape kinds still occupy space when they carry w/h; otherwise
      // give them a nominal footprint so bbox and lint don't lose them.
      const w = typeof p.w === 'number' ? p.w : 100
      const h = typeof p.h === 'number' ? p.h : 100
      return { x: shape.x, y: shape.y, w, h }
    }
  }
}

// Label font size for a shape that centers text inside itself (geo, note).
export function labelFontSize(shape: ScratchRecord): number {
  const size = (shape.props as { size?: unknown }).size
  return LABEL_FONT_SIZES[typeof size === 'string' ? size : 'm'] ?? LABEL_FONT_SIZES.m
}
