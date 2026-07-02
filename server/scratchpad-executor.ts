import { basename } from 'path'
import sharp from 'sharp'

import {
  type IndexKey,
  type TLPageId,
  type TLRecord,
  type TLStore,
  AssetRecordType,
  ZERO_INDEX_KEY,
  createBindingId,
  createShapeId,
  createTLStore,
  defaultBindingUtils,
  defaultShapeUtils,
  getIndexAbove,
  getSnapshot,
  loadSnapshot,
  toRichText
} from 'tldraw'

import type { ScratchImageQuality, ScratchOp, ScratchOpResult, ScratchStyle } from '@/lib/types'

import { publishEvent } from './events'
import { type ScratchpadDoc, loadScratchpadDoc, saveScratchpadDoc } from './scratchpad'

// Server-side Scratchpad writer. The browser is no longer required to draw: we run
// the same ops against a *headless* tldraw store here, persist the snapshot, and
// broadcast `scratchpad:updated` so any open tab reloads from disk. Only `view`
// (rendering pixels) still needs a live tab; `read` is served straight off disk.
// See docs/moi-scratchpad.md.
//
// We drive the store directly rather than an `Editor`, because the Editor needs a
// DOM + text measurement that don't exist in the server runtime. The store
// validates every `put`, so a malformed record throws instead of corrupting the
// file — that validation is what keeps hand-built records honest.

// Each shape type's default props, read once from its ShapeUtil. `getDefaultProps`
// is an instance method but doesn't touch the editor for the shapes we create, so a
// throwaway instance is enough; the result is static per type, so we cache it.
const shapeDefaults = new Map<string, Record<string, unknown>>()
function defaultProps(type: string): Record<string, unknown> {
  let cached = shapeDefaults.get(type)
  if (!cached) {
    const Util = defaultShapeUtils.find(u => (u as unknown as { type: string }).type === type)
    if (!Util) throw new Error(`Unknown shape type "${type}"`)
    // eslint-disable-next-line new-cap -- Util is a class constructor pulled from a list
    const util = new (Util as unknown as new (editor: unknown) => {
      getDefaultProps(): Record<string, unknown>
    })({})
    cached = util.getDefaultProps()
    shapeDefaults.set(type, cached)
  }
  return { ...cached }
}

// Map an op's optional color/size/fill onto tldraw shape props (omitted → tldraw default).
function styleProps(style: ScratchStyle): Record<string, unknown> {
  return {
    ...(style.color ? { color: style.color } : {}),
    ...(style.size ? { size: style.size } : {}),
    ...(style.fill ? { fill: style.fill } : {})
  }
}

// A fresh headless store hydrated from the saved snapshot (or empty). The
// snapshot shape (`{ document }`) matches what the browser PUTs and loads.
function buildStore(doc: ScratchpadDoc | null): TLStore {
  const store = createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils })
  if (doc?.store) {
    loadSnapshot(store, { document: doc } as unknown as Parameters<typeof loadSnapshot>[1])
  }
  // Seed the document/page records a fresh (or partial) store needs to be valid.
  store.ensureStoreIsUsable()
  return store
}

function firstPageId(store: TLStore): TLPageId {
  for (const record of store.allRecords()) {
    if (record.typeName === 'page') return record.id
  }
  // ensureStoreIsUsable always leaves a page; this is unreachable in practice.
  throw new Error('Scratchpad has no page')
}

// The next fractional index above every shape on the page, so a new shape lands on
// top. IndexKeys sort lexicographically, so a string max is a valid ordering.
function nextIndex(store: TLStore, pageId: TLPageId): IndexKey {
  let max: IndexKey = ZERO_INDEX_KEY
  for (const record of store.allRecords()) {
    if (record.typeName === 'shape' && record.parentId === pageId && record.index > max) {
      max = record.index
    }
  }
  return getIndexAbove(max)
}

// Hand-build a shape record. TS can't correlate `type` with its matching props
// variant across the TLRecord union, so we assert — `store.put` validates the
// result at runtime, which is the real guarantee.
function shapeRecord(fields: {
  id: ReturnType<typeof createShapeId>
  type: string
  x: number
  y: number
  index: IndexKey
  parentId: TLPageId
  props: Record<string, unknown>
}): TLRecord {
  return {
    typeName: 'shape',
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {},
    ...fields
  } as unknown as TLRecord
}

// Bind one arrow terminal to a target shape, so the arrow follows when it moves.
function arrowBinding(
  arrowId: ReturnType<typeof createShapeId>,
  targetId: ReturnType<typeof createShapeId>,
  terminal: 'start' | 'end'
): TLRecord {
  return {
    id: createBindingId(),
    typeName: 'binding',
    type: 'arrow',
    fromId: arrowId,
    toId: targetId,
    meta: {},
    props: {
      terminal,
      normalizedAnchor: { x: 0.5, y: 0.5 },
      isPrecise: false,
      isExact: false,
      snap: 'none'
    }
  } as unknown as TLRecord
}

// Resize an image file to fit the canvas and embed it as a webp data URL, never
// enlarging — so a 10MB paste becomes a lightweight asset. `quality` picks the
// preset: 'lo' caps the long side smaller (default), 'hi' keeps more pixels.
// `.rotate()` bakes in EXIF orientation (phone photos).
const IMAGE_PRESETS: Record<ScratchImageQuality, { dim: number; quality: number }> = {
  lo: { dim: 768, quality: 78 },
  hi: { dim: 2048, quality: 88 }
}
const MAX_IMAGE_BYTES = 50 * 1024 * 1024

async function processCanvasImage(
  path: string,
  quality: ScratchImageQuality
): Promise<{ src: string; w: number; h: number; mimeType: string; name: string }> {
  const file = Bun.file(path)
  if (!(await file.exists())) throw new Error(`Image file not found: ${path}`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length === 0) throw new Error(`Image file is empty: ${path}`)
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image is too large (${Math.round(bytes.length / 1e6)}MB, max 50MB): ${path}`)
  }
  const preset = IMAGE_PRESETS[quality]
  const { data, info } = await sharp(bytes)
    .rotate()
    .resize(preset.dim, preset.dim, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: preset.quality })
    .toBuffer({ resolveWithObject: true })
  return {
    src: `data:image/webp;base64,${data.toString('base64')}`,
    w: info.width,
    h: info.height,
    mimeType: 'image/webp',
    name: basename(path)
  }
}

// Create an image shape and its backing asset from a file. Async — unlike the
// other ops — because it decodes and resizes the image first.
async function applyAddImage(
  store: TLStore,
  op: Extract<ScratchOp, { kind: 'add-image' }>
): Promise<ScratchOpResult> {
  const pageId = firstPageId(store)
  const { src, w, h, mimeType, name } = await processCanvasImage(op.path, op.quality ?? 'lo')
  const assetId = AssetRecordType.createId()
  store.put([
    {
      id: assetId,
      typeName: 'asset',
      type: 'image',
      meta: {},
      props: { name, src, w, h, mimeType, isAnimated: false }
    } as unknown as TLRecord
  ])
  store.put([
    shapeRecord({
      id: createShapeId(op.name),
      type: 'image',
      x: op.x,
      y: op.y,
      index: nextIndex(store, pageId),
      parentId: pageId,
      props: { ...defaultProps('image'), w, h, assetId }
    })
  ])
  return { name: op.name }
}

// Apply one mutating op to the store. `read` and `view` are handled elsewhere
// (disk / browser) and never reach here. Returns the op's result.
function applyOp(store: TLStore, op: ScratchOp): ScratchOpResult {
  const pageId = firstPageId(store)
  const requireShape = (name: string) => {
    const shape = store.get(createShapeId(name))
    if (!shape || shape.typeName !== 'shape') throw new Error(`No shape named "${name}"`)
    return shape
  }

  switch (op.kind) {
    case 'add-rect': {
      store.put([
        shapeRecord({
          id: createShapeId(op.name),
          type: 'geo',
          x: op.x,
          y: op.y,
          index: nextIndex(store, pageId),
          parentId: pageId,
          props: {
            ...defaultProps('geo'),
            geo: 'rectangle',
            w: op.w,
            h: op.h,
            ...styleProps(op),
            ...(op.text ? { richText: toRichText(op.text) } : {})
          }
        })
      ])
      return { name: op.name }
    }
    case 'add-text': {
      store.put([
        shapeRecord({
          id: createShapeId(op.name),
          type: 'text',
          x: op.x,
          y: op.y,
          index: nextIndex(store, pageId),
          parentId: pageId,
          props: { ...defaultProps('text'), richText: toRichText(op.text), ...styleProps(op) }
        })
      ])
      return { name: op.name }
    }
    case 'add-note': {
      store.put([
        shapeRecord({
          id: createShapeId(op.name),
          type: 'note',
          x: op.x,
          y: op.y,
          index: nextIndex(store, pageId),
          parentId: pageId,
          props: { ...defaultProps('note'), richText: toRichText(op.text), ...styleProps(op) }
        })
      ])
      return { name: op.name }
    }
    case 'add-arrow': {
      // Validate named endpoints up front — better a clear error than a dangling
      // binding that corrupts the snapshot.
      if ('name' in op.from) requireShape(op.from.name)
      if ('name' in op.to) requireShape(op.to.name)
      const arrowId = createShapeId(op.name)
      // Point endpoints carry absolute coords; bound endpoints get placeholders the
      // binding then drives. `elbow` routes with right angles; default is a curved arc.
      store.put([
        shapeRecord({
          id: arrowId,
          type: 'arrow',
          x: 0,
          y: 0,
          index: nextIndex(store, pageId),
          parentId: pageId,
          props: {
            ...defaultProps('arrow'),
            ...styleProps(op),
            ...(op.elbow ? { kind: 'elbow' } : {}),
            start: 'name' in op.from ? { x: 0, y: 0 } : { x: op.from.x, y: op.from.y },
            end: 'name' in op.to ? { x: 100, y: 0 } : { x: op.to.x, y: op.to.y }
          }
        })
      ])
      const bindings: TLRecord[] = []
      if ('name' in op.from)
        bindings.push(arrowBinding(arrowId, createShapeId(op.from.name), 'start'))
      if ('name' in op.to) bindings.push(arrowBinding(arrowId, createShapeId(op.to.name), 'end'))
      if (bindings.length > 0) store.put(bindings)
      return { name: op.name }
    }
    case 'move': {
      const shape = requireShape(op.name)
      store.put([{ ...shape, x: op.x, y: op.y }])
      return { ok: true }
    }
    case 'set': {
      const shape = requireShape(op.name)
      store.put([
        { ...shape, props: { ...shape.props, richText: toRichText(op.text) } } as TLRecord
      ])
      return { ok: true }
    }
    case 'delete': {
      const id = createShapeId(op.name)
      // Remove the shape plus any binding that references it, or the leftover
      // binding would dangle and invalidate the snapshot.
      const ids = [id, ...bindingsTouching(store, op.name)]
      store.remove(ids)
      return { ok: true }
    }
    case 'clear': {
      const ids = store
        .allRecords()
        .filter(r => r.typeName === 'shape' || r.typeName === 'binding')
        .map(r => r.id)
      if (ids.length > 0) store.remove(ids)
      return { ok: true }
    }
    default:
      // 'read' (disk) and 'view' (browser) are routed before this; anything else
      // is an unknown op kind.
      throw new Error(`Cannot execute op "${op.kind}" on the server`)
  }
}

// Ids of bindings whose start/end is the named shape.
function bindingsTouching(store: TLStore, name: string): TLRecord['id'][] {
  const target = createShapeId(name)
  const ids: TLRecord['id'][] = []
  for (const record of store.allRecords()) {
    if (record.typeName !== 'binding') continue
    const b = record as unknown as { fromId?: string; toId?: string }
    if (b.fromId === target || b.toId === target) ids.push(record.id)
  }
  return ids
}

// Serialize writes per workspace so two concurrent ops can't load-load-save-save
// and lose one. Each op reads the latest disk snapshot, mutates, and writes back.
const chains = new Map<string, Promise<unknown>>()
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = (chains.get(key) ?? Promise.resolve()).catch(() => {})
  const run = prev.then(fn)
  chains.set(
    key,
    run.catch(() => {})
  )
  return run
}

// Execute a mutating Scratchpad op headlessly: load the snapshot, apply, persist,
// and notify open tabs to reload. No browser tab required.
export function executeScratchOp(
  workspacePath: string,
  workspaceId: string,
  op: ScratchOp
): Promise<ScratchOpResult> {
  return withLock(workspacePath, async () => {
    const { document } = await loadScratchpadDoc(workspacePath)
    const store = buildStore(document)
    // add-image decodes/resizes the file first, so it's the one async op.
    const result = op.kind === 'add-image' ? await applyAddImage(store, op) : applyOp(store, op)
    const next = getSnapshot(store).document as unknown as ScratchpadDoc
    await saveScratchpadDoc(next, workspacePath)
    publishEvent({ type: 'scratchpad:updated', workspaceId })
    return result
  })
}
