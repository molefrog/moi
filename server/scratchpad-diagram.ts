import { pathToFileURL } from 'node:url'

import ELK from 'elkjs/lib/elk-api.js'
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api.js'
import { type TLStore, createShapeId, getIndexAbove, toRichText } from 'tldraw'
import type { TLRecord } from 'tldraw'

import type { ScratchColor, ScratchFill, ScratchOp, ScratchOpResult } from '@/lib/types'

import {
  ARROW_LABEL_FONT_SIZES,
  LABEL_FONT_SIZES,
  LABEL_PADDING,
  LINE_HEIGHT,
  TEXT_FONT_SIZES,
  fitRectToLabel,
  textBlockSize
} from './scratchpad-metrics'
import {
  arrowBinding,
  defaultProps,
  firstPageId,
  nextIndex,
  shapeRecord
} from './scratchpad-records'
import { parseColor, parseFill } from './scratchpad-style'

// The declarative diagram compiler behind `moi scratch diagram`. The agent
// declares structure — nodes, groups, labeled edges, a title — and never touches
// a coordinate: labels are measured with the real canvas font
// (scratchpad-metrics.ts), nodes sized to fit, and positions computed by ELK's
// layered algorithm (the engine behind D2 and Mermaid's ELK mode). Geometry is
// non-overlapping, aligned, and evenly spaced by construction.

// ---- geometry constants -------------------------------------------------------

// Node sizing: wrap labels at ~260px (a comfortable diagram-box width) and never
// go smaller than a clickable box.
const NODE_TARGET_WIDTH = 260
const NODE_MIN_W = 120
const NODE_MIN_H = 64
// tldraw note shapes are a fixed 200×200 (no w/h props) — mirrored here for layout.
const NOTE_SIZE = 200
// Gap between the title's baseline block and the diagram's top edge.
const TITLE_GAP = 48
// Auto-placement: gap below the existing canvas content.
const AUTO_PLACE_GAP = 96
// Room reserved inside a group's top edge so its label doesn't sit on children.
const GROUP_PADDING = '[top=56,left=24,bottom=24,right=24]'

// ---- ELK ----------------------------------------------------------------------

// elkjs's default entry (`elkjs`/`lib/main.js`) breaks under Bun: Bun defines
// `self`, so the bundled fake-worker shim misdetects its environment. The
// real-worker API sidesteps that — layout runs in an actual Worker. The instance
// is a lazy module singleton; `unref` keeps the worker from pinning a
// short-lived process (tests, one-shot CLI paths) open.
type ElkInstance = InstanceType<typeof ELK>
let elkSingleton: ElkInstance | undefined
function elk(): ElkInstance {
  if (!elkSingleton) {
    const workerPath = Bun.resolveSync('elkjs/lib/elk-worker.min.js', import.meta.dir)
    elkSingleton = new ELK({
      workerFactory: () => {
        const worker = new Worker(pathToFileURL(workerPath).href)
        worker.unref()
        return worker
      }
    })
  }
  return elkSingleton
}

// ---- spec validation ----------------------------------------------------------

// The compiled (validated + measured) spec: colors/fills parsed onto their
// tldraw values, every node sized.
type CompiledNode = {
  id: string
  label: string
  shape: 'rect' | 'note'
  color?: ScratchColor
  fill?: ScratchFill
  w: number
  h: number
}
type CompiledGroup = { id: string; label?: string; color?: ScratchColor; children: string[] }
type CompiledEdge = {
  from: string
  to: string
  label?: string
  color?: ScratchColor
  elbow: boolean
}
type CompiledSpec = {
  title?: string
  direction: 'right' | 'down'
  nodes: CompiledNode[]
  groups: CompiledGroup[]
  edges: CompiledEdge[]
}

// Shape ids double as CLI handles (`moi scratch move <id> ...`), so keep them
// flag-safe and unambiguous.
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

function fail(message: string): never {
  throw new Error(`Invalid diagram spec: ${message}`)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Reject unknown keys so a typo ("colour", "text" instead of "label") surfaces
// as an error instead of being silently dropped.
function checkKeys(obj: Record<string, unknown>, allowed: string[], where: string) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      fail(`unknown key "${key}" in ${where}. Allowed keys: ${allowed.join(', ')}.`)
    }
  }
}

function requireId(v: unknown, where: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(`${where} needs a non-empty string "id"`)
  if (!ID_RE.test(v)) {
    fail(`${where} id "${v}" is invalid — use letters, digits, "_" or "-" (it becomes a shape id)`)
  }
  // These ids are minted by the compiler itself under the same prefix.
  if (v === 'title' || /^edge-\d+$/.test(v)) {
    fail(`${where} id "${v}" is reserved for the diagram's own title/edge shapes — pick another id`)
  }
  return v
}

// Parse a color/fill through the shared CLI vocabulary, prefixing errors with
// where in the spec they happened.
function parseColorAt(v: unknown, where: string): ScratchColor {
  if (typeof v !== 'string') fail(`${where}: "color" must be a string (palette name or hex)`)
  try {
    return parseColor(v)
  } catch (err) {
    fail(`${where}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function parseFillAt(v: unknown, where: string): ScratchFill {
  if (typeof v !== 'string') fail(`${where}: "fill" must be a string`)
  try {
    return parseFill(v)
  } catch (err) {
    fail(`${where}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// Validate the raw (JSON-parsed) spec and compile it: parse colors/fills, size
// every node to its measured label. Throws descriptive, actionable errors —
// they travel back to the CLI over the control socket.
export function compileDiagramSpec(raw: unknown): CompiledSpec {
  if (!isRecord(raw)) fail('the spec must be a JSON object like {"nodes": [...], "edges": [...]}')
  checkKeys(raw, ['title', 'direction', 'nodes', 'groups', 'edges'], 'the spec')

  let title: string | undefined
  if (raw.title !== undefined) {
    if (typeof raw.title !== 'string' || raw.title.length === 0) {
      fail('"title" must be a non-empty string')
    }
    title = raw.title
  }

  let direction: 'right' | 'down' = 'right'
  if (raw.direction !== undefined) {
    if (raw.direction !== 'right' && raw.direction !== 'down') {
      fail(`"direction" must be "right" or "down", got ${JSON.stringify(raw.direction)}`)
    }
    direction = raw.direction
  }

  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) {
    fail('"nodes" must be a non-empty array — a diagram needs at least one node')
  }

  const ids = new Set<string>()
  const claimId = (id: string, where: string) => {
    if (ids.has(id))
      fail(`duplicate id "${id}" (${where}) — node and group ids share one namespace`)
    ids.add(id)
  }

  const nodes: CompiledNode[] = raw.nodes.map((n, i) => {
    const where = `nodes[${i}]`
    if (!isRecord(n)) fail(`${where} must be an object`)
    checkKeys(n, ['id', 'label', 'shape', 'color', 'fill', 'width'], where)
    const id = requireId(n.id, where)
    claimId(id, where)
    if (typeof n.label !== 'string' || n.label.length === 0) {
      fail(`${where} ("${id}") needs a non-empty string "label"`)
    }
    const shape = n.shape ?? 'rect'
    if (shape !== 'rect' && shape !== 'note') {
      fail(`${where} ("${id}"): "shape" must be "rect" or "note", got ${JSON.stringify(n.shape)}`)
    }
    if (shape === 'note' && n.fill !== undefined) {
      fail(`${where} ("${id}"): "fill" doesn't apply to note-shaped nodes`)
    }
    let width: number | undefined
    if (n.width !== undefined) {
      if (typeof n.width !== 'number' || !Number.isFinite(n.width) || n.width < 40) {
        fail(`${where} ("${id}"): "width" must be a number ≥ 40 (a label wrap-width hint in px)`)
      }
      width = n.width
    }
    const size =
      shape === 'note'
        ? { w: NOTE_SIZE, h: NOTE_SIZE }
        : fitRectToLabel(n.label, {
            size: 'm',
            targetWidth: width ?? NODE_TARGET_WIDTH,
            minW: NODE_MIN_W,
            minH: NODE_MIN_H
          })
    return {
      id,
      label: n.label,
      shape,
      ...(n.color !== undefined ? { color: parseColorAt(n.color, `${where} ("${id}")`) } : {}),
      ...(n.fill !== undefined ? { fill: parseFillAt(n.fill, `${where} ("${id}")`) } : {}),
      ...size
    }
  })

  const rawGroups = raw.groups === undefined ? [] : raw.groups
  if (!Array.isArray(rawGroups)) fail('"groups" must be an array')
  const groups: CompiledGroup[] = rawGroups.map((g, i) => {
    const where = `groups[${i}]`
    if (!isRecord(g)) fail(`${where} must be an object`)
    checkKeys(g, ['id', 'label', 'color', 'children'], where)
    const id = requireId(g.id, where)
    claimId(id, where)
    if (g.label !== undefined && (typeof g.label !== 'string' || g.label.length === 0)) {
      fail(`${where} ("${id}"): "label" must be a non-empty string when given`)
    }
    if (!Array.isArray(g.children) || g.children.length === 0) {
      fail(`${where} ("${id}") needs a non-empty "children" array of node/group ids`)
    }
    const children = g.children.map(c => {
      if (typeof c !== 'string') fail(`${where} ("${id}"): children must be strings (ids)`)
      return c
    })
    return {
      id,
      ...(g.label !== undefined ? { label: g.label } : {}),
      ...(g.color !== undefined ? { color: parseColorAt(g.color, `${where} ("${id}")`) } : {}),
      children
    }
  })

  // Group membership: every child exists, belongs to at most one group, and
  // group nesting can't form a cycle.
  const parentOf = new Map<string, string>()
  for (const g of groups) {
    for (const child of g.children) {
      if (!ids.has(child)) {
        fail(
          `group "${g.id}": unknown child "${child}" — children must reference node or group ids defined in the spec`
        )
      }
      const prev = parentOf.get(child)
      if (prev) {
        fail(`"${child}" is a child of both "${prev}" and "${g.id}" — it can only be in one group`)
      }
      parentOf.set(child, g.id)
    }
  }
  for (const g of groups) {
    const seen = new Set<string>([g.id])
    for (let p = parentOf.get(g.id); p; p = parentOf.get(p)) {
      if (seen.has(p))
        fail(`group nesting forms a cycle through "${p}" — groups cannot contain themselves`)
      seen.add(p)
    }
  }

  const rawEdges = raw.edges === undefined ? [] : raw.edges
  if (!Array.isArray(rawEdges)) fail('"edges" must be an array')
  const edges: CompiledEdge[] = rawEdges.map((e, i) => {
    const where = `edges[${i}]`
    if (!isRecord(e)) fail(`${where} must be an object`)
    checkKeys(e, ['from', 'to', 'label', 'color', 'elbow'], where)
    for (const end of ['from', 'to'] as const) {
      if (typeof e[end] !== 'string' || !ids.has(e[end])) {
        fail(
          `${where}: unknown endpoint ${JSON.stringify(e[end])} — "${end}" must be a node or group id defined in the spec`
        )
      }
    }
    const from = e.from as string
    const to = e.to as string
    if (from === to)
      fail(`${where}: "from" and "to" are both "${from}" — self-loops aren't supported`)
    if (e.label !== undefined && typeof e.label !== 'string') {
      fail(`${where}: "label" must be a string`)
    }
    if (e.elbow !== undefined && typeof e.elbow !== 'boolean') {
      fail(`${where}: "elbow" must be true or false`)
    }
    return {
      from,
      to,
      ...(e.label ? { label: e.label } : {}),
      ...(e.color !== undefined ? { color: parseColorAt(e.color, where) } : {}),
      elbow: e.elbow === true
    }
  })

  return { ...(title !== undefined ? { title } : {}), direction, nodes, groups, edges }
}

// ---- layout -------------------------------------------------------------------

// Build the ELK graph: groups become hierarchical nodes (INCLUDE_CHILDREN lets
// edges cross their boundaries), model order follows the spec so output is
// stable and reads in the order the agent wrote it.
function buildElkGraph(spec: CompiledSpec): ElkNode {
  const childrenOf = new Map<string, string[]>()
  const hasParent = new Set<string>()
  for (const g of spec.groups) {
    childrenOf.set(g.id, g.children)
    for (const c of g.children) hasParent.add(c)
  }
  const nodeById = new Map(spec.nodes.map(n => [n.id, n]))
  const groupById = new Map(spec.groups.map(g => [g.id, g]))

  const toElkNode = (id: string): ElkNode => {
    const node = nodeById.get(id)
    if (node) return { id, width: node.w, height: node.h }
    const group = groupById.get(id)!
    // A long group label must not overflow its rect: force a minimum width from
    // the measured label (children alone decide the size otherwise).
    const labelMinW = group.label
      ? Math.ceil(textBlockSize(group.label, LABEL_FONT_SIZES.m).w + LABEL_PADDING * 2)
      : 0
    return {
      id,
      layoutOptions: {
        'elk.padding': GROUP_PADDING,
        ...(labelMinW > 0
          ? {
              'elk.nodeSize.constraints': 'MINIMUM_SIZE',
              'elk.nodeSize.minimum': `(${labelMinW},0)`
            }
          : {})
      },
      children: childrenOf.get(id)!.map(toElkNode)
    }
  }

  // Top level = everything not claimed by a group, in spec order (nodes first,
  // then groups — considerModelOrder keeps this reading order in the output).
  const topLevel = [
    ...spec.nodes.filter(n => !hasParent.has(n.id)).map(n => n.id),
    ...spec.groups.filter(g => !hasParent.has(g.id)).map(g => g.id)
  ]

  const edges: ElkExtendedEdge[] = spec.edges.map((e, i) => ({
    id: `edge-${i}`,
    sources: [e.from],
    targets: [e.to],
    ...(e.label
      ? {
          labels: [
            {
              text: e.label,
              // Measured at the arrow-label font so ELK reserves real room.
              width: Math.ceil(textBlockSize(e.label, ARROW_LABEL_FONT_SIZES.m).w),
              height: Math.ceil(textBlockSize(e.label, ARROW_LABEL_FONT_SIZES.m).h),
              layoutOptions: { 'elk.edgeLabels.inline': 'true' }
            }
          ]
        }
      : {})
  }))

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': spec.direction === 'down' ? 'DOWN' : 'RIGHT',
      // Required for edges that cross group boundaries — without it each group
      // lays out in isolation and cross-group edges aren't routed.
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '96',
      'elk.spacing.componentComponent': '64',
      // Stable, spec-order-respecting output: nodes/edges keep the order the
      // agent declared them instead of being re-sorted by crossing heuristics.
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES'
    },
    children: topLevel.map(toElkNode),
    edges
  }
}

type PlacedRect = { x: number; y: number; w: number; h: number }

// ELK child coordinates are parent-relative — accumulate to absolute.
function collectPlacements(node: ElkNode, ox: number, oy: number, out: Map<string, PlacedRect>) {
  for (const child of node.children ?? []) {
    const x = ox + (child.x ?? 0)
    const y = oy + (child.y ?? 0)
    out.set(child.id, { x, y, w: child.width ?? 0, h: child.height ?? 0 })
    collectPlacements(child, x, y, out)
  }
}

// ---- anchoring ----------------------------------------------------------------

// Best-effort bounding box of what's already on the canvas, for auto-placement.
// Geo/image shapes carry w/h; notes are 200×200 (+growY); text height is
// approximated from its font size; arrows fall back to their start/end points.
// Precision doesn't matter much — the diagram lands AUTO_PLACE_GAP below.
function contentBounds(store: TLStore): PlacedRect | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const record of store.allRecords()) {
    if (record.typeName !== 'shape') continue
    const r = record as unknown as {
      type: string
      x: number
      y: number
      props: {
        w?: number
        h?: number
        growY?: number
        size?: string
        start?: { x: number; y: number }
        end?: { x: number; y: number }
      }
    }
    let w = typeof r.props.w === 'number' ? r.props.w : 0
    let h = typeof r.props.h === 'number' ? r.props.h : 0
    if (r.type === 'note') {
      w = NOTE_SIZE
      h = NOTE_SIZE + (r.props.growY ?? 0)
    } else if (r.type === 'text') {
      h = (TEXT_FONT_SIZES[r.props.size ?? 'm'] ?? TEXT_FONT_SIZES.m) * LINE_HEIGHT
    } else if (r.type === 'arrow' && r.props.start && r.props.end) {
      const xs = [r.props.start.x, r.props.end.x]
      const ys = [r.props.start.y, r.props.end.y]
      w = Math.max(...xs) - Math.min(...xs)
      h = Math.max(...ys) - Math.min(...ys)
      minX = Math.min(minX, r.x + Math.min(...xs))
      minY = Math.min(minY, r.y + Math.min(...ys))
      maxX = Math.max(maxX, r.x + Math.max(...xs))
      maxY = Math.max(maxY, r.y + Math.max(...ys))
      continue
    } else {
      h += r.props.growY ?? 0
    }
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + w)
    maxY = Math.max(maxY, r.y + h)
  }
  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// ---- compilation to records -----------------------------------------------------

/**
 * Compile a `diagram` op onto the store: validate the spec, measure and size
 * nodes, run ELK layered layout, and put every resulting tldraw record in one
 * batch. Returns the created shape names so the agent can address them.
 */
export async function applyDiagram(
  store: TLStore,
  op: Extract<ScratchOp, { kind: 'diagram' }>
): Promise<ScratchOpResult> {
  const spec = compileDiagramSpec(op.spec)
  const pageId = firstPageId(store)

  const layout = await elk().layout(buildElkGraph(spec))
  const placed = new Map<string, PlacedRect>()
  collectPlacements(layout, 0, 0, placed)

  // Diagram-local bounds (ELK content only; the title hangs above them).
  let minX = Infinity
  let minY = Infinity
  for (const rect of placed.values()) {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
  }
  if (!Number.isFinite(minX)) {
    minX = 0
    minY = 0
  }

  // Title block, placed above the diagram with a gap; it extends the overall
  // bounds so the anchor is the top-left of *everything* emitted.
  const titleSize = spec.title ? textBlockSize(spec.title, TEXT_FONT_SIZES.xl) : null
  const titleLocal = titleSize
    ? { x: minX, y: minY - TITLE_GAP - titleSize.h, w: Math.ceil(titleSize.w), h: titleSize.h }
    : null

  // Anchor: explicit `--at`, else just below the existing canvas content.
  let anchor: { x: number; y: number }
  if (op.x !== undefined && op.y !== undefined) {
    anchor = { x: op.x, y: op.y }
  } else {
    const existing = contentBounds(store)
    anchor = existing
      ? { x: existing.x, y: existing.y + existing.h + AUTO_PLACE_GAP }
      : { x: 0, y: 0 }
  }
  const dx = anchor.x - (titleLocal ? Math.min(minX, titleLocal.x) : minX)
  const dy = anchor.y - (titleLocal ? titleLocal.y : minY)

  // Deterministic prefixed ids — refuse to silently overwrite existing shapes.
  const shapeName = (suffix: string) => `${op.name}-${suffix}`
  const requireFree = (name: string) => {
    if (store.get(createShapeId(name))) {
      throw new Error(`Shape "${name}" already exists — pass a different --id prefix`)
    }
    return createShapeId(name)
  }

  const records: TLRecord[] = []
  const created: string[] = []
  let index = nextIndex(store, pageId)
  const pushShape = (fields: Omit<Parameters<typeof shapeRecord>[0], 'index' | 'parentId'>) => {
    records.push(shapeRecord({ ...fields, index, parentId: pageId }))
    index = getIndexAbove(index)
  }

  // Groups first (lowest z, so nodes draw on top). DFS order isn't needed —
  // `placed` already has absolute rects — but outer-before-inner keeps nested
  // group rects stacked correctly, and spec order does that for the common case.
  for (const group of spec.groups) {
    const rect = placed.get(group.id)!
    const name = shapeName(group.id)
    pushShape({
      id: requireFree(name),
      type: 'geo',
      x: Math.round(rect.x + dx),
      y: Math.round(rect.y + dy),
      props: {
        ...defaultProps('geo'),
        geo: 'rectangle',
        w: Math.round(rect.w),
        h: Math.round(rect.h),
        fill: 'none',
        ...(group.color ? { color: group.color } : {}),
        ...(group.label
          ? { richText: toRichText(group.label), align: 'start', verticalAlign: 'start' }
          : {})
      }
    })
    created.push(name)
  }

  for (const node of spec.nodes) {
    const rect = placed.get(node.id)!
    const name = shapeName(node.id)
    if (node.shape === 'note') {
      pushShape({
        id: requireFree(name),
        type: 'note',
        x: Math.round(rect.x + dx),
        y: Math.round(rect.y + dy),
        props: {
          ...defaultProps('note'),
          richText: toRichText(node.label),
          ...(node.color ? { color: node.color } : {})
        }
      })
    } else {
      pushShape({
        id: requireFree(name),
        type: 'geo',
        x: Math.round(rect.x + dx),
        y: Math.round(rect.y + dy),
        props: {
          ...defaultProps('geo'),
          geo: 'rectangle',
          w: Math.round(rect.w),
          h: Math.round(rect.h),
          richText: toRichText(node.label),
          // Default to the toolbar's default rect look (a light wash) unless
          // the spec picked a fill.
          fill: node.fill ?? 'solid',
          ...(node.color ? { color: node.color } : {})
        }
      })
    }
    created.push(name)
  }

  if (spec.title && titleLocal) {
    const name = shapeName('title')
    pushShape({
      id: requireFree(name),
      type: 'text',
      x: Math.round(titleLocal.x + dx),
      y: Math.round(titleLocal.y + dy),
      props: {
        ...defaultProps('text'),
        richText: toRichText(spec.title),
        size: 'xl',
        w: titleLocal.w,
        autoSize: true
      }
    })
    created.push(name)
  }

  // Edges last (topmost). Arrows are *bound* to their endpoint shapes: the
  // browser routes bound arrows itself and re-routes them when shapes move, so
  // ELK's edge routes are unnecessary — we only seed start/end with the shape
  // centers so the raw snapshot isn't degenerate before a tab opens it.
  const bindings: TLRecord[] = []
  for (const [i, edge] of spec.edges.entries()) {
    const name = shapeName(`edge-${i}`)
    const arrowId = requireFree(name)
    const from = placed.get(edge.from)!
    const to = placed.get(edge.to)!
    pushShape({
      id: arrowId,
      type: 'arrow',
      x: 0,
      y: 0,
      props: {
        ...defaultProps('arrow'),
        ...(edge.elbow ? { kind: 'elbow' } : {}),
        ...(edge.color ? { color: edge.color } : {}),
        ...(edge.label ? { richText: toRichText(edge.label) } : {}),
        start: { x: Math.round(from.x + from.w / 2 + dx), y: Math.round(from.y + from.h / 2 + dy) },
        end: { x: Math.round(to.x + to.w / 2 + dx), y: Math.round(to.y + to.h / 2 + dy) }
      }
    })
    bindings.push(arrowBinding(arrowId, createShapeId(shapeName(edge.from)), 'start'))
    bindings.push(arrowBinding(arrowId, createShapeId(shapeName(edge.to)), 'end'))
    created.push(name)
  }

  // One atomic put: either the whole diagram lands or none of it does.
  store.put([...records, ...bindings])
  return { name: op.name, created }
}
