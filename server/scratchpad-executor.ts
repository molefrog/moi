import { basename } from 'path'
import sharp from 'sharp'

import { Store } from '@tldraw/store'
import {
  type TLPageId,
  type TLRecord,
  type TLStoreProps,
  type TLStoreSnapshot,
  AssetRecordType,
  createBindingId,
  createShapeId,
  createTLSchema,
  toRichText
} from '@tldraw/tlschema'
import { type IndexKey, ZERO_INDEX_KEY, getIndexAbove } from '@tldraw/utils'

import { describeNewerWriter, sequencesAhead } from '@/lib/scratchpad-skew'
import type {
  ScratchImageQuality,
  ScratchOp,
  ScratchOpResult,
  ScratchStyle,
  ScratchpadWriter
} from '@/lib/types'

import { publishEvent } from './events'
import {
  SCRATCHPAD_WRITER,
  type ScratchpadDoc,
  loadScratchpadDoc,
  saveScratchpadDoc
} from './scratchpad'
import { storeScratchpadAsset } from './scratchpad-assets'
import { SHAPE_DEFAULTS } from './scratchpad-shape-defaults'

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
//
// Deliberately built from `@tldraw/store` + `@tldraw/tlschema` (+ `@tldraw/utils`),
// NOT the `tldraw` package: the `tldraw` entry point evaluates the whole React
// editor, and `react-dom` (19.2+) throws at load time whenever the `react` it
// resolves is a different version — a real hazard for a global `bun i -g`
// install, whose shared, hoisted `node_modules` can pair moi's `react-dom` with a
// `react` some other global package locked earlier. That crash used to take the
// entire server down at `moi start`, before it served a single request. The
// sub-packages import no React at all, so the server never resolves it. A test
// (`server/test/server-react-free.test.ts`) keeps this module React-free.

// The headless store. `TLStoreProps` is what a schema built by `createTLSchema`
// expects, but the only prop anything reads here is `defaultName` (the
// integrity checker, when it seeds the document record). The rest — asset
// upload, user resolution, editor mount — exists for a mounted `Editor`, which
// this store never gets.
type HeadlessStore = Store<TLRecord, TLStoreProps>

const unsupported = (what: string) => (): never => {
  throw new Error(`${what} is not available on the server-side scratchpad store`)
}

// Cast: the editor-facing props are unreachable on a store that never mounts an
// `Editor`; `defaultName` is the one field the store itself consumes.
const HEADLESS_STORE_PROPS = {
  defaultName: '',
  assets: { upload: unsupported('Asset upload'), resolve: () => null, remove: async () => {} },
  users: { currentUser: null, resolve: () => null },
  onMount: () => {}
} as unknown as TLStoreProps

// A fresh copy of a shape type's default props (see scratchpad-shape-defaults.ts).
function defaultProps(type: string): Record<string, unknown> {
  const defaults = SHAPE_DEFAULTS[type]
  if (!defaults) throw new Error(`Unknown shape type "${type}"`)
  return { ...defaults }
}

// Map an op's optional color/size/fill onto tldraw shape props (omitted → tldraw default).
function styleProps(style: ScratchStyle): Record<string, unknown> {
  return {
    ...(style.color ? { color: style.color } : {}),
    ...(style.size ? { size: style.size } : {}),
    ...(style.fill ? { fill: style.fill } : {})
  }
}

// Run a synchronous load with tldraw's own logging held back. On a failed
// migration `StoreSchema` prints `Error migrating store Incompatible schema?`
// itself, which reaches the `moi scratch` caller ahead of — and contradicting —
// the actionable error we throw below ("the file is intact"). Whatever it says
// is replayed if the load actually succeeds, so only the swallowed-by-a-throw
// case is lost. Safe to swap `console.error` around: `loadStoreSnapshot` is sync.
function loadQuietly(load: () => void): void {
  const original = console.error
  const held: unknown[][] = []
  console.error = (...args: unknown[]) => {
    held.push(args)
  }
  try {
    load()
  } finally {
    console.error = original
  }
  for (const args of held) original(...args)
}

// A fresh headless store hydrated from the saved snapshot (or empty). The
// snapshot shape (`{ document }`) matches what the browser PUTs and loads.
// A failed load is inspected for version skew: tldraw has no down-migrations,
// so a snapshot written by a newer tldraw is unreadable here — but intact.
// That gets a loud, actionable error instead of tldraw's bare `migration-error`
// (which surfaces verbatim through the control port to the `moi scratch` CLI).
function buildStore(
  doc: ScratchpadDoc | null,
  writer: ScratchpadWriter | undefined
): HeadlessStore {
  // `createTLSchema()` with no arguments is tldraw's default shape/binding/asset
  // set — the same schema the browser's `createTLStore` builds from
  // `defaultShapeUtils` + `defaultBindingUtils` (a test pins the two serialized
  // schemas equal), so a snapshot written here round-trips into the live canvas.
  const store: HeadlessStore = new Store({ schema: createTLSchema(), props: HEADLESS_STORE_PROPS })
  // `loadStoreSnapshot` migrates the records forward to this schema, replaces the
  // store's contents, and seeds whatever a usable document still lacks (the
  // document/page records of a fresh or partial canvas) — so an empty canvas
  // loads an empty snapshot rather than skipping the load.
  const snapshot = doc?.store
    ? (doc as unknown as TLStoreSnapshot)
    : { store: {}, schema: store.schema.serialize() }
  try {
    loadQuietly(() => store.loadStoreSnapshot(snapshot))
  } catch (err) {
    const ahead = sequencesAhead(doc?.schema, store.schema.serialize().sequences)
    if (ahead.length > 0) {
      throw new Error(
        `Scratchpad was written by a newer moi (${describeNewerWriter(writer, ahead)}); ` +
          `this server has tldraw ${SCRATCHPAD_WRITER.tldraw}. Restart the newer server or ` +
          `update this install (bun install -g moi-computer@latest). ` +
          `The canvas file is intact — do not reset it.`
      )
    }
    // Not skew — the snapshot itself is bad. Keep the original cause visible.
    throw new Error(
      `Scratchpad snapshot failed to load (not a version mismatch — the file may be ` +
        `corrupted): ${err instanceof Error ? err.message : String(err)}`
    )
  }
  return store
}

function firstPageId(store: HeadlessStore): TLPageId {
  for (const record of store.allRecords()) {
    if (record.typeName === 'page') return record.id
  }
  // ensureStoreIsUsable always leaves a page; this is unreachable in practice.
  throw new Error('Scratchpad has no page')
}

// The next fractional index above every shape on the page, so a new shape lands on
// top. IndexKeys sort lexicographically, so a string max is a valid ordering.
function nextIndex(store: HeadlessStore, pageId: TLPageId): IndexKey {
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

// Resize an image file to fit the canvas, never enlarging — so a 10MB paste
// becomes a lightweight asset. `quality` picks the preset: 'lo' caps the long
// side smaller (default), 'hi' keeps more pixels. `.rotate()` bakes in EXIF
// orientation (phone photos).
const IMAGE_PRESETS: Record<ScratchImageQuality, { dim: number; quality: number }> = {
  lo: { dim: 768, quality: 78 },
  hi: { dim: 2048, quality: 88 }
}
const MAX_IMAGE_BYTES = 50 * 1024 * 1024

async function processCanvasImage(
  path: string,
  quality: ScratchImageQuality
): Promise<{ data: Buffer; w: number; h: number; mimeType: string; name: string }> {
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
  return { data, w: info.width, h: info.height, mimeType: 'image/webp', name: basename(path) }
}

// Create an image shape and its backing asset from a file. The resized bytes go
// to `.moi/.scratchpad/` and the asset record holds the `asset:` file
// reference — never a base64 blob (see scratchpad-assets.ts). Async — unlike
// the other ops — because it decodes and resizes the image first.
async function applyAddImage(
  store: HeadlessStore,
  workspacePath: string,
  op: Extract<ScratchOp, { kind: 'add-image' }>
): Promise<ScratchOpResult> {
  const pageId = firstPageId(store)
  // Re-adding under an existing id replaces that shape; note its current asset so
  // we can drop it below once nothing else references it (else its file leaks).
  const prev = store.get(createShapeId(op.name)) as unknown as
    | { props?: { assetId?: unknown } }
    | undefined
  const prevAssetId = typeof prev?.props?.assetId === 'string' ? prev.props.assetId : undefined
  const { data, w, h, mimeType, name } = await processCanvasImage(op.path, op.quality ?? 'lo')
  const { src } = await storeScratchpadAsset(workspacePath, data, mimeType)
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
  // The replaced shape's old asset is now unreachable — drop it so the sweep can
  // reclaim its file.
  if (prevAssetId && prevAssetId !== assetId && !anyShapeUsesAsset(store, prevAssetId)) {
    store.remove([prevAssetId as unknown as TLRecord['id']])
  }
  return { name: op.name }
}

// Apply one mutating op to the store. `read` and `view` are handled elsewhere
// (disk / browser) and never reach here. Returns the op's result.
function applyOp(store: HeadlessStore, op: ScratchOp): ScratchOpResult {
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
      const shape = store.get(id) as unknown as { props?: { assetId?: unknown } } | undefined
      const assetId = typeof shape?.props?.assetId === 'string' ? shape.props.assetId : undefined
      // Remove the shape plus any binding that references it, or the leftover
      // binding would dangle and invalidate the snapshot.
      const ids = [id, ...bindingsTouching(store, op.name)]
      store.remove(ids)
      // If that was the last shape using the image's asset, drop the asset record
      // too so the post-save sweep can reclaim its file (mirrors `clear`).
      if (assetId && !anyShapeUsesAsset(store, assetId)) {
        store.remove([assetId as unknown as TLRecord['id']])
      }
      return { ok: true }
    }
    case 'clear': {
      // Assets go too — with every shape gone they're unreachable, and dropping
      // the records lets the post-save sweep reclaim their files on disk.
      const ids = store
        .allRecords()
        .filter(r => r.typeName === 'shape' || r.typeName === 'binding' || r.typeName === 'asset')
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

// True if any shape still references the given asset id. tldraw lets several
// shapes share one asset (e.g. a duplicated image), so delete/replace only drops
// the asset record when its last user is gone — leaving the file for the sweep.
function anyShapeUsesAsset(store: HeadlessStore, assetId: string): boolean {
  for (const record of store.allRecords()) {
    if (record.typeName !== 'shape') continue
    const props = (record as unknown as { props?: { assetId?: unknown } }).props
    if (props?.assetId === assetId) return true
  }
  return false
}

// Ids of bindings whose start/end is the named shape.
function bindingsTouching(store: HeadlessStore, name: string): TLRecord['id'][] {
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
    const { document, writer } = await loadScratchpadDoc(workspacePath)
    const store = buildStore(document, writer)
    // add-image decodes/resizes the file first, so it's the one async op.
    const result =
      op.kind === 'add-image' ? await applyAddImage(store, workspacePath, op) : applyOp(store, op)
    const next = store.getStoreSnapshot() as unknown as ScratchpadDoc
    await saveScratchpadDoc(next, workspacePath)
    publishEvent({ type: 'scratchpad:updated', workspaceId })
    return result
  })
}
