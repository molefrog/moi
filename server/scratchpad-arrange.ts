import { type TLRecord, type TLStore, createShapeId } from 'tldraw'

import type { ScratchOp, ScratchPlacement } from '@/lib/types'

import { extractText } from './scratchpad'
import { TEXT_FONT_SIZES, fitRectToLabel, textBlockSize } from './scratchpad-metrics'

// Geometry for the Scratchpad's arrangement verbs: relative placement on add,
// and align / distribute / autosize / tidy. This is where "put it below the
// proxy box" turns into coordinates — the agent states topology, the server
// does the arithmetic. Everything here runs against the headless store (see
// scratchpad-executor.ts), so bounds are computed from records, not a DOM.
//
// Arrows are never arranged directly: a bound arrow's geometry lives in its
// bindings and follows its shapes, so moving the arrow record would fight the
// binding. Every verb skips arrows; an arrow can't be an anchor either.

// The store's record union can't be narrowed by `typeName` alone, so verbs view
// records through this minimal shape. `store.put` re-validates on write, which
// is the real guarantee behind the casts below.
type ShapeLike = {
  id: string
  typeName: 'shape'
  type: string
  x: number
  y: number
  props: Record<string, unknown>
}

export type Bounds = { x: number; y: number; w: number; h: number }

// tldraw note shapes carry no w/h props: they're a fixed 200×200 pad that only
// grows downward (`props.growY`) when the text overflows.
const NOTE_SIZE = 200

// Auto-sizing for rects when `--size` is omitted: fit the label at a readable
// wrap width, or fall back to a sensible node box for an unlabeled rect.
const RECT_TARGET_WIDTH = 260
const DEFAULT_RECT = { w: 160, h: 96 }

/** Rect size when the caller didn't give one: fitted to the label (never
 * overflowing — the point of omitting `--size`), or the default node box. */
export function autoRectSize(
  text: string | undefined,
  sizeToken: string | undefined
): { w: number; h: number } {
  if (!text) return { ...DEFAULT_RECT }
  return fitRectToLabel(text, { size: sizeToken ?? 'm', targetWidth: RECT_TARGET_WIDTH })
}

/**
 * Axis-aligned bounds of a shape record, without an editor. Geo/image shapes
 * carry explicit w/h; notes are the fixed pad plus growY; text has no reliable
 * stored width, so it's estimated with the canvas font metrics. Arrows have no
 * standalone bounds (their geometry lives in bindings) → null.
 */
export function shapeBounds(record: TLRecord): Bounds | null {
  const s = record as unknown as ShapeLike
  if (s.type === 'arrow') return null
  if (s.type === 'note') {
    const growY = typeof s.props.growY === 'number' ? s.props.growY : 0
    return { x: s.x, y: s.y, w: NOTE_SIZE, h: NOTE_SIZE + growY }
  }
  if (s.type === 'text') {
    const token = typeof s.props.size === 'string' ? s.props.size : 'm'
    const fontSize = TEXT_FONT_SIZES[token] ?? TEXT_FONT_SIZES.m
    const block = textBlockSize(extractText(s.props) ?? '', fontSize)
    return { x: s.x, y: s.y, w: block.w, h: block.h }
  }
  // Geo, image, and anything else with stored dimensions; unknown types (e.g.
  // the user's freehand strokes) degrade to a point at their origin.
  const w = typeof s.props.w === 'number' ? s.props.w : 0
  const h = typeof s.props.h === 'number' ? s.props.h : 0
  return { x: s.x, y: s.y, w, h }
}

function getShapeRecord(store: TLStore, name: string): TLRecord {
  const record = store.get(createShapeId(name))
  if (!record || record.typeName !== 'shape') throw new Error(`No shape named "${name}"`)
  return record
}

/** Estimated size of a text shape *before* it exists, for placing it. */
export function textAddSize(text: string, sizeToken: string | undefined): { w: number; h: number } {
  const fontSize = TEXT_FONT_SIZES[sizeToken ?? 'm'] ?? TEXT_FONT_SIZES.m
  const block = textBlockSize(text, fontSize)
  return { w: block.w, h: block.h }
}

/** The fixed footprint a new note occupies, for placing it. */
export function noteAddSize(): { w: number; h: number } {
  return { w: NOTE_SIZE, h: NOTE_SIZE }
}

/**
 * Turn a relative placement into the new shape's top-left: offset from the
 * anchor by `gap` on the placement axis, aligned on the cross axis.
 */
export function resolvePlacement(
  store: TLStore,
  place: ScratchPlacement,
  size: { w: number; h: number }
): { x: number; y: number } {
  const anchor = shapeBounds(getShapeRecord(store, place.anchor))
  if (!anchor) {
    throw new Error(
      `Cannot place relative to arrow "${place.anchor}" — anchor a rect, note, text, or image instead`
    )
  }
  // Cross-axis coordinate: leading edges flush / centered / trailing edges flush.
  const across = (aPos: number, aLen: number, len: number) =>
    place.align === 'start'
      ? aPos
      : place.align === 'end'
        ? aPos + aLen - len
        : aPos + (aLen - len) / 2
  switch (place.side) {
    case 'below':
      return { x: across(anchor.x, anchor.w, size.w), y: anchor.y + anchor.h + place.gap }
    case 'above':
      return { x: across(anchor.x, anchor.w, size.w), y: anchor.y - place.gap - size.h }
    case 'right':
      return { x: anchor.x + anchor.w + place.gap, y: across(anchor.y, anchor.h, size.h) }
    case 'left':
      return { x: anchor.x - place.gap - size.w, y: across(anchor.y, anchor.h, size.h) }
  }
}

// How far a shape must move so its chosen edge/center matches the target's.
// Each edge moves exactly one axis — align never disturbs the other.
function alignDelta(
  edge: Extract<ScratchOp, { kind: 'align' }>['edge'],
  target: Bounds,
  b: Bounds
): { dx: number; dy: number } {
  switch (edge) {
    case 'left':
      return { dx: target.x - b.x, dy: 0 }
    case 'right':
      return { dx: target.x + target.w - (b.x + b.w), dy: 0 }
    case 'center-x':
      return { dx: target.x + target.w / 2 - (b.x + b.w / 2), dy: 0 }
    case 'top':
      return { dx: 0, dy: target.y - b.y }
    case 'bottom':
      return { dx: 0, dy: target.y + target.h - (b.y + b.h) }
    case 'center-y':
      return { dx: 0, dy: target.y + target.h / 2 - (b.y + b.h / 2) }
  }
}

/** Align each listed shape's edge/center to the anchor's (`to`, default the
 * first listed). Anchor stays put; arrows in the list are skipped. */
export function applyAlign(store: TLStore, op: Extract<ScratchOp, { kind: 'align' }>): void {
  const anchorName = op.to ?? op.names[0]
  const target = shapeBounds(getShapeRecord(store, anchorName))
  if (!target) throw new Error(`Cannot align to arrow "${anchorName}" — pick a non-arrow anchor`)
  for (const name of op.names) {
    if (name === anchorName) continue
    const rec = getShapeRecord(store, name)
    const b = shapeBounds(rec)
    if (!b) continue // arrows follow their bound shapes; never move them directly
    const { dx, dy } = alignDelta(op.edge, target, b)
    if (dx === 0 && dy === 0) continue
    const s = rec as unknown as ShapeLike
    store.put([{ ...rec, x: s.x + dx, y: s.y + dy } as TLRecord])
  }
}

/**
 * Distribute shapes along an axis, in their current spatial order. With `gap`,
 * repack at exactly that spacing (the first shape stays put); without, keep the
 * first and last where they are and equalize the gaps between.
 */
export function applyDistribute(
  store: TLStore,
  op: Extract<ScratchOp, { kind: 'distribute' }>
): void {
  const items: { name: string; rec: TLRecord; b: Bounds }[] = []
  for (const name of op.names) {
    const rec = getShapeRecord(store, name)
    const b = shapeBounds(rec)
    if (b) items.push({ name, rec, b }) // arrows (null bounds) never distribute
  }
  const pos = (b: Bounds) => (op.axis === 'x' ? b.x : b.y)
  const len = (b: Bounds) => (op.axis === 'x' ? b.w : b.h)
  // Spatial order, name as a deterministic tie-break for stacked shapes.
  items.sort((a, z) => pos(a.b) - pos(z.b) || a.name.localeCompare(z.name))
  if (items.length < 2) throw new Error('distribute needs at least 2 non-arrow shapes')

  const moveTo = (item: (typeof items)[number], target: number) => {
    const delta = target - pos(item.b)
    if (delta === 0) return
    const s = item.rec as unknown as ShapeLike
    store.put([
      {
        ...item.rec,
        ...(op.axis === 'x' ? { x: s.x + delta } : { y: s.y + delta })
      } as TLRecord
    ])
  }

  if (op.gap !== undefined) {
    let cursor = pos(items[0].b) + len(items[0].b)
    for (const item of items.slice(1)) {
      moveTo(item, cursor + op.gap)
      cursor += op.gap + len(item.b)
    }
    return
  }
  if (items.length < 3) {
    throw new Error(
      'distribute without --gap needs at least 3 shapes (the first and last stay fixed)'
    )
  }
  const first = items[0]
  const last = items[items.length - 1]
  const middle = items.slice(1, -1)
  const free =
    pos(last.b) - (pos(first.b) + len(first.b)) - middle.reduce((sum, m) => sum + len(m.b), 0)
  const gap = free / (middle.length + 1)
  let cursor = pos(first.b) + len(first.b)
  for (const item of middle) {
    moveTo(item, cursor + gap)
    cursor += gap + len(item.b)
  }
}

/** Re-fit each listed rect to its label (same sizing as an auto-sized add),
 * keeping its top-left. Non-rect or unlabeled ids fail the whole op — the
 * executor is all-or-nothing, so nothing persists on error. */
export function applyAutosize(store: TLStore, op: Extract<ScratchOp, { kind: 'autosize' }>): void {
  const fits = op.names.map(name => {
    const rec = getShapeRecord(store, name)
    const s = rec as unknown as ShapeLike
    if (s.type !== 'geo') {
      throw new Error(`Cannot autosize "${name}": only labeled rects refit (it is a ${s.type})`)
    }
    const text = extractText(s.props)
    if (!text) throw new Error(`Cannot autosize "${name}": it has no label to fit`)
    const sizeToken = typeof s.props.size === 'string' ? s.props.size : undefined
    return { rec, s, fit: autoRectSize(text, sizeToken) }
  })
  for (const { rec, s, fit } of fits) {
    store.put([{ ...rec, props: { ...s.props, w: fit.w, h: fit.h } } as TLRecord])
  }
}

// Two edges/centers closer than this get pulled exactly together by tidy —
// the "almost lined up" band a human eyeballs away.
const NEAR = 10

type ClusterEntry = { s: ShapeLike; value: number; locked: boolean }

// Cluster near-equal values and snap each cluster of ≥2 onto one shared line.
// Sorted by (value, id) first, and a value joins the open cluster while it sits
// within NEAR of the cluster's first member — both make the grouping
// deterministic. The shared line is the grid-rounded mean of the cluster's
// locked members when any exist (so already-aligned shapes stay put and others
// come to them), else of the whole cluster. Returns the ids that clustered.
function snapClusters(
  entries: ClusterEntry[],
  grid: number,
  apply: (s: ShapeLike, delta: number) => void
): Set<string> {
  const snapped = new Set<string>()
  const sorted = [...entries].sort((a, b) => a.value - b.value || a.s.id.localeCompare(b.s.id))
  let cluster: ClusterEntry[] = []
  const flush = () => {
    if (cluster.length >= 2) {
      const locked = cluster.filter(e => e.locked)
      const pool = locked.length > 0 ? locked : cluster
      const mean = pool.reduce((sum, e) => sum + e.value, 0) / pool.length
      const target = Math.round(mean / grid) * grid
      for (const e of cluster) {
        snapped.add(e.s.id)
        if (!e.locked && e.value !== target) apply(e.s, target - e.value)
      }
    }
    cluster = []
  }
  for (const e of sorted) {
    if (cluster.length > 0 && e.value - cluster[0].value > NEAR) flush()
    cluster.push(e)
  }
  flush()
  return snapped
}

/**
 * Canvas-wide cleanup: snap every non-arrow shape's position (and geo w/h) to
 * the grid, then pull nearly-aligned left edges, horizontal centers, and top
 * edges exactly together. Bound arrows follow their shapes on their own.
 */
export function applyTidy(store: TLStore, op: Extract<ScratchOp, { kind: 'tidy' }>): void {
  const grid = op.grid ?? 8
  if (!Number.isFinite(grid) || grid <= 0) throw new Error('Grid must be a positive number')
  const snap = (v: number) => Math.round(v / grid) * grid

  // Work on copies, mutate through the passes, and put once at the end.
  const shapes: ShapeLike[] = []
  for (const record of store.allRecords()) {
    if (record.typeName !== 'shape') continue
    const s = record as unknown as ShapeLike
    if (s.type === 'arrow') continue
    shapes.push({ ...s, props: { ...s.props } })
  }

  // Pass 1 — grid snap. Sizes only for geo: notes/text size themselves, and
  // resampling an image's w/h would stretch it for no visual gain.
  for (const s of shapes) {
    s.x = snap(s.x)
    s.y = snap(s.y)
    if (s.type === 'geo') {
      if (typeof s.props.w === 'number') s.props.w = Math.max(grid, snap(s.props.w))
      if (typeof s.props.h === 'number') s.props.h = Math.max(grid, snap(s.props.h))
    }
  }

  // Widths/heights don't change in the remaining passes; positions do.
  const dims = new Map<string, { w: number; h: number }>()
  for (const s of shapes) {
    const b = shapeBounds(s as unknown as TLRecord)
    dims.set(s.id, { w: b?.w ?? 0, h: b?.h ?? 0 })
  }

  // Pass 2 — left edges. Pass 3 — horizontal centers, where shapes whose left
  // edge just clustered are locked: they anchor a center cluster but never move
  // again on x, so centering can't undo the left alignment. Pass 4 — top edges.
  const leftAligned = snapClusters(
    shapes.map(s => ({ s, value: s.x, locked: false })),
    grid,
    (s, d) => {
      s.x += d
    }
  )
  snapClusters(
    shapes.map(s => ({
      s,
      value: s.x + (dims.get(s.id)?.w ?? 0) / 2,
      locked: leftAligned.has(s.id)
    })),
    grid,
    (s, d) => {
      s.x += d
    }
  )
  snapClusters(
    shapes.map(s => ({ s, value: s.y, locked: false })),
    grid,
    (s, d) => {
      s.y += d
    }
  )

  if (shapes.length > 0) store.put(shapes as unknown as TLRecord[])
}
