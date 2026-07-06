import envPaths from 'env-paths'
import { mkdir } from 'node:fs/promises'
import { join } from 'path'

import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { decompress } from 'wawoff2'

import type { ScratchColor } from '@/lib/types'

import { SCRATCH_COLOR_HEX } from '@/lib/scratch-palette'

import {
  type ScratchArrowBinding,
  type ScratchBounds,
  type ScratchRecord,
  labelFontSize,
  readScratchpadRecords,
  scratchShapeBounds
} from './scratchpad'
import {
  ARROW_LABEL_FONT_SIZES,
  LABEL_PADDING,
  LINE_HEIGHT,
  TEXT_FONT_SIZES,
  textBlockSize,
  wrapText
} from './scratchpad-metrics'

// Server-side Scratchpad renderer: our own SVG emitter for the primitive shape
// set, rasterized by resvg with the real canvas font. This is the always-on half
// of `moi scratch view` — with no live browser tab, the agent still gets pixels.
// It is a *layout-feedback approximation*, not tldraw's painter: geometry, text
// wrap, and color are faithful; the hand-drawn stroke texture is not. Anything
// outside the primitive set renders as a labeled placeholder rather than failing
// the whole view.

// ---- Font ----------------------------------------------------------------------

// resvg's fontdb can't read woff2, so the canvas font (Shantell Sans Informal,
// shipped in @tldraw/assets) is decompressed to TTF once and cached in moi's
// cache dir, keyed by the @tldraw/assets version so upgrades re-derive it.
const FONT_FAMILY = 'Shantell Sans Informal'
const CACHE_DIR = envPaths('moi', { suffix: false }).cache

let fontTtfPath: Promise<string> | undefined
function ensureFontTtf(): Promise<string> {
  fontTtfPath ??= (async () => {
    const woff2Path = Bun.resolveSync(
      '@tldraw/assets/fonts/Shantell_Sans-Informal_Regular.woff2',
      import.meta.dir
    )
    // The package version rides in the sibling package.json of the fonts dir —
    // resolving the woff2 already pinned us inside the installed package.
    let version = '0'
    try {
      const pkg = await Bun.file(join(woff2Path, '..', '..', 'package.json')).json()
      if (typeof pkg.version === 'string') version = pkg.version
    } catch {}
    const ttfPath = join(CACHE_DIR, 'fonts', `shantell-${version}.ttf`)
    if (!(await Bun.file(ttfPath).exists())) {
      const ttf = await decompress(new Uint8Array(await Bun.file(woff2Path).arrayBuffer()))
      await mkdir(join(CACHE_DIR, 'fonts'), { recursive: true })
      await Bun.write(ttfPath, ttf)
    }
    return ttfPath
  })()
  return fontTtfPath
}

// ---- Colors --------------------------------------------------------------------

const BACKGROUND = '#f9fafb' // tldraw light-theme canvas
const PLACEHOLDER_GREY = '#9fa8b2'

// tldraw's stroke widths per size token (STROKE_SIZES in its shape constants).
const STROKE_WIDTHS: Record<string, number> = { s: 2, m: 3.5, l: 5, xl: 10 }

function paletteHex(props: Record<string, unknown>): string {
  const color = props.color
  return (
    SCRATCH_COLOR_HEX[(typeof color === 'string' ? color : 'black') as ScratchColor] ??
    SCRATCH_COLOR_HEX.black
  )
}

function strokeWidth(props: Record<string, unknown>): number {
  const size = props.size
  return STROKE_WIDTHS[typeof size === 'string' ? size : 'm'] ?? STROKE_WIDTHS.m
}

// Mix a palette hex toward white (positive ratio) or black (negative) —
// approximates tldraw's light "semi" fill tints, pastel note bodies, and
// darkened note ink without carrying its full theme tables.
function whiteMix(hex: string, ratio: number): string {
  const n = parseInt(hex.slice(1), 16)
  const target = ratio >= 0 ? 255 : 0
  const t = Math.abs(ratio)
  const mix = (c: number) => Math.round(c * (1 - t) + target * t)
  const [r, g, b] = [mix((n >> 16) & 0xff), mix((n >> 8) & 0xff), mix(n & 0xff)]
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

// ---- SVG helpers ----------------------------------------------------------------

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

type TextBlockOptions = {
  lines: string[]
  // The box the block is aligned within.
  box: ScratchBounds
  fontSize: number
  fill: string
  align: 'start' | 'middle' | 'end'
  verticalAlign: 'start' | 'middle' | 'end'
  // Halo the glyphs in the background color, so labels stay readable over lines.
  halo?: boolean
}

// Emit one wrapped text block as per-line <text> elements. resvg has no CSS
// layout, so line positions are computed here with the same LINE_HEIGHT the
// measurement module uses — what lint measures is what renders.
function textBlockSvg(opts: TextBlockOptions): string {
  const { lines, box, fontSize, fill, align, verticalAlign } = opts
  const lineH = fontSize * LINE_HEIGHT
  const totalH = lines.length * lineH
  const top =
    verticalAlign === 'start'
      ? box.y
      : verticalAlign === 'end'
        ? box.y + box.h - totalH
        : box.y + (box.h - totalH) / 2
  const anchorX = align === 'start' ? box.x : align === 'end' ? box.x + box.w : box.x + box.w / 2
  const anchor = align === 'start' ? 'start' : align === 'end' ? 'end' : 'middle'
  const halo = opts.halo
    ? ` stroke="${BACKGROUND}" stroke-width="${fmt(fontSize / 4)}" paint-order="stroke" stroke-linejoin="round"`
    : ''
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length === 0) continue
    // Baseline ≈ 0.35em above the line box's vertical center — close enough to
    // Shantell's metrics for layout feedback.
    const baseline = top + i * lineH + lineH / 2 + fontSize * 0.35
    out.push(
      `<text x="${fmt(anchorX)}" y="${fmt(baseline)}" font-family="${FONT_FAMILY}" ` +
        `font-size="${fmt(fontSize)}" fill="${fill}" text-anchor="${anchor}"${halo}>` +
        `${esc(lines[i])}</text>`
    )
  }
  return out.join('\n')
}

function alignOf(props: Record<string, unknown>, key: 'align' | 'verticalAlign' | 'textAlign') {
  const v = props[key]
  return v === 'start' || v === 'end' ? v : ('middle' as const)
}

function rotationAttr(shape: ScratchRecord, bounds: ScratchBounds): string {
  if (!shape.rotation) return ''
  const deg = (shape.rotation * 180) / Math.PI
  const cx = bounds.x + bounds.w / 2
  const cy = bounds.y + bounds.h / 2
  return ` transform="rotate(${fmt(deg)} ${fmt(cx)} ${fmt(cy)})"`
}

// Grey dashed stand-in for anything outside the primitive set — the agent still
// sees that *something* occupies the space, labeled with its type.
function placeholderSvg(label: string, b: ScratchBounds): string {
  const box =
    `<rect x="${fmt(b.x)}" y="${fmt(b.y)}" width="${fmt(Math.max(b.w, 40))}" ` +
    `height="${fmt(Math.max(b.h, 24))}" rx="4" fill="none" stroke="${PLACEHOLDER_GREY}" ` +
    `stroke-width="2" stroke-dasharray="6 4"/>`
  const text = textBlockSvg({
    lines: [label],
    box: { ...b, w: Math.max(b.w, 40), h: Math.max(b.h, 24) },
    fontSize: 14,
    fill: PLACEHOLDER_GREY,
    align: 'middle',
    verticalAlign: 'middle'
  })
  return `${box}\n${text}`
}

// ---- Fills (rect interiors) -------------------------------------------------------

// Map a shape's tldraw fill style onto SVG paint. 'solid' is the light tint and
// 'fill' the true opaque body — the naming quirk documented on ScratchFill.
// 'pattern' references a per-color hatch <pattern> collected into <defs>.
function rectFill(props: Record<string, unknown>, hex: string, patterns: Set<string>): string {
  switch (props.fill) {
    case 'solid':
      return whiteMix(hex, 0.8)
    case 'fill':
      return hex
    case 'pattern': {
      const color = typeof props.color === 'string' ? props.color : 'black'
      patterns.add(color)
      return `url(#hatch-${color})`
    }
    default:
      return 'none'
  }
}

function hatchDefs(patterns: Set<string>): string {
  if (patterns.size === 0) return ''
  const defs = [...patterns].map(color => {
    const hex = SCRATCH_COLOR_HEX[color as ScratchColor] ?? SCRATCH_COLOR_HEX.black
    return (
      `<pattern id="hatch-${color}" patternUnits="userSpaceOnUse" width="8" height="8" ` +
      `patternTransform="rotate(45)">` +
      `<line x1="0" y1="0" x2="0" y2="8" stroke="${hex}" stroke-width="1.3" opacity="0.65"/>` +
      `</pattern>`
    )
  })
  return `<defs>${defs.join('')}</defs>`
}

// ---- Arrows ---------------------------------------------------------------------

type ArrowGeometry = {
  // The rendered polyline/curve control points: [start, ...bends, end].
  points: { x: number; y: number }[]
  // Quadratic bézier control for the arc kind (undefined = straight/elbow).
  ctrl?: { x: number; y: number }
  mid: { x: number; y: number }
}

type Pt = { x: number; y: number }

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const len = (v: Pt) => Math.hypot(v.x, v.y)
const norm = (v: Pt): Pt => {
  const l = len(v) || 1
  return { x: v.x / l, y: v.y / l }
}

// Where the segment from `from` toward `center` (inside `rect`) crosses the rect
// border, backed off by `standoff` px so the arrowhead sits just outside.
function clipToRect(from: Pt, center: Pt, rect: ScratchBounds, standoff: number): Pt {
  const d = sub(center, from)
  // Parametric entry point: the largest t in [0,1] where the point is still
  // outside on some axis. Standard slab test against each of the four edges.
  let tEnter = 0
  if (d.x !== 0) {
    const t1 = (rect.x - from.x) / d.x
    const t2 = (rect.x + rect.w - from.x) / d.x
    tEnter = Math.max(tEnter, Math.min(t1, t2))
  }
  if (d.y !== 0) {
    const t1 = (rect.y - from.y) / d.y
    const t2 = (rect.y + rect.h - from.y) / d.y
    tEnter = Math.max(tEnter, Math.min(t1, t2))
  }
  tEnter = Math.min(Math.max(tEnter, 0), 1)
  const hit = { x: from.x + d.x * tEnter, y: from.y + d.y * tEnter }
  const dir = norm(d)
  return { x: hit.x - dir.x * standoff, y: hit.y - dir.y * standoff }
}

const ARROW_STANDOFF = 6

// Resolve an arrow's drawable geometry: bound terminals land on the target's
// border (center-aimed, clipped, 6px standoff); free terminals sit at their
// stored point. Elbow arrows route orthogonally; arc arrows bow perpendicular.
function arrowGeometry(
  shape: ScratchRecord,
  bindings: ScratchArrowBinding[],
  boundsById: Map<string, ScratchBounds>
): ArrowGeometry | null {
  const p = shape.props as { start?: Pt; end?: Pt; bend?: unknown; kind?: unknown }
  const terminalRect = (terminal: 'start' | 'end'): ScratchBounds | undefined => {
    const b = bindings.find(b => b.arrowId === shape.id && b.terminal === terminal)
    return b ? boundsById.get(b.targetId) : undefined
  }
  const startRect = terminalRect('start')
  const endRect = terminalRect('end')
  const center = (r: ScratchBounds): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
  const free = (t?: Pt): Pt => ({ x: shape.x + (t?.x ?? 0), y: shape.y + (t?.y ?? 0) })
  let start = startRect ? center(startRect) : free(p.start)
  let end = endRect ? center(endRect) : free(p.end)
  if (len(sub(end, start)) < 1) return null

  if (p.kind === 'elbow') {
    // H-V(-H) or V-H(-V) around the dominant axis, then clip the end segments
    // (each is axis-aligned, so the border hit stays on the route).
    const d = sub(end, start)
    const route: Pt[] =
      Math.abs(d.x) >= Math.abs(d.y)
        ? [
            start,
            { x: (start.x + end.x) / 2, y: start.y },
            { x: (start.x + end.x) / 2, y: end.y },
            end
          ]
        : [
            start,
            { x: start.x, y: (start.y + end.y) / 2 },
            { x: end.x, y: (start.y + end.y) / 2 },
            end
          ]
    if (startRect) route[0] = clipToRect(route[1], route[0], startRect, ARROW_STANDOFF)
    if (endRect) {
      route[route.length - 1] = clipToRect(
        route[route.length - 2],
        route[route.length - 1],
        endRect,
        ARROW_STANDOFF
      )
    }
    const mid = {
      x: (route[1].x + route[2].x) / 2,
      y: (route[1].y + route[2].y) / 2
    }
    return { points: route, mid }
  }

  // Arc: clip the straight chord first, then bow it. tldraw's `bend` is the
  // perpendicular offset at the midpoint; a hair of bow (8% of length) stands in
  // for tldraw's hand-drawn feel when bend is zero.
  if (startRect) start = clipToRect(end, start, startRect, ARROW_STANDOFF)
  if (endRect) end = clipToRect(start, end, endRect, ARROW_STANDOFF)
  const d = sub(end, start)
  const l = len(d)
  const bend = typeof p.bend === 'number' && p.bend !== 0 ? p.bend : l * 0.08
  const perp = { x: -d.y / (l || 1), y: d.x / (l || 1) }
  const mid = { x: (start.x + end.x) / 2 + perp.x * bend, y: (start.y + end.y) / 2 + perp.y * bend }
  // Quadratic control that makes the curve pass through `mid` at t=0.5.
  const ctrl = {
    x: 2 * mid.x - (start.x + end.x) / 2,
    y: 2 * mid.y - (start.y + end.y) / 2
  }
  return { points: [start, end], ctrl, mid }
}

function arrowheadSvg(tip: Pt, back: Pt, sw: number, hex: string): string {
  const dir = norm(sub(tip, back))
  const size = Math.max(sw * 3, 9)
  const base = { x: tip.x - dir.x * size, y: tip.y - dir.y * size }
  const perp = { x: -dir.y, y: dir.x }
  const half = size * 0.55
  const a = { x: base.x + perp.x * half, y: base.y + perp.y * half }
  const b = { x: base.x - perp.x * half, y: base.y - perp.y * half }
  return (
    `<polygon points="${fmt(tip.x)},${fmt(tip.y)} ${fmt(a.x)},${fmt(a.y)} ` +
    `${fmt(b.x)},${fmt(b.y)}" fill="${hex}"/>`
  )
}

function arrowSvg(shape: ScratchRecord, geo: ArrowGeometry): string {
  const hex = paletteHex(shape.props)
  const sw = strokeWidth(shape.props)
  const p = shape.props as { arrowheadStart?: unknown; arrowheadEnd?: unknown; size?: unknown }
  const pts = geo.points
  const path = geo.ctrl
    ? `M ${fmt(pts[0].x)} ${fmt(pts[0].y)} Q ${fmt(geo.ctrl.x)} ${fmt(geo.ctrl.y)} ` +
      `${fmt(pts[1].x)} ${fmt(pts[1].y)}`
    : `M ${pts.map(q => `${fmt(q.x)} ${fmt(q.y)}`).join(' L ')}`
  const parts = [
    `<path d="${path}" fill="none" stroke="${hex}" stroke-width="${fmt(sw)}" ` +
      `stroke-linecap="round" stroke-linejoin="round"/>`
  ]
  // Default arrowheads: none at the start, a triangle at the end.
  const end = pts[pts.length - 1]
  const beforeEnd = geo.ctrl ?? pts[pts.length - 2]
  if (p.arrowheadEnd !== 'none') parts.push(arrowheadSvg(end, beforeEnd, sw, hex))
  const beforeStart = geo.ctrl ?? pts[1]
  if (p.arrowheadStart && p.arrowheadStart !== 'none') {
    parts.push(arrowheadSvg(pts[0], beforeStart, sw, hex))
  }
  if (shape.text) {
    const size = (shape.props as { size?: unknown }).size
    const fontSize =
      ARROW_LABEL_FONT_SIZES[typeof size === 'string' ? size : 'm'] ?? ARROW_LABEL_FONT_SIZES.m
    const block = textBlockSize(shape.text, fontSize)
    parts.push(
      textBlockSvg({
        lines: block.lines,
        box: { x: geo.mid.x - block.w / 2, y: geo.mid.y - block.h / 2, w: block.w, h: block.h },
        fontSize,
        fill: hex,
        align: 'middle',
        verticalAlign: 'middle',
        halo: true
      })
    )
  }
  return parts.join('\n')
}

// ---- Shape emitters --------------------------------------------------------------

function geoSvg(shape: ScratchRecord, bounds: ScratchBounds, patterns: Set<string>): string {
  const props = shape.props
  const hex = paletteHex(props)
  const sw = strokeWidth(props)
  const fill = rectFill(props, hex, patterns)
  const rot = rotationAttr(shape, bounds)
  const kind = (props as { geo?: unknown }).geo
  let body: string
  if (kind === 'rectangle' || kind === undefined) {
    body =
      `<rect x="${fmt(bounds.x)}" y="${fmt(bounds.y)}" width="${fmt(bounds.w)}" ` +
      `height="${fmt(bounds.h)}" rx="4" fill="${fill}" stroke="${hex}" stroke-width="${fmt(sw)}"${rot}/>`
  } else if (kind === 'ellipse') {
    body =
      `<ellipse cx="${fmt(bounds.x + bounds.w / 2)}" cy="${fmt(bounds.y + bounds.h / 2)}" ` +
      `rx="${fmt(bounds.w / 2)}" ry="${fmt(bounds.h / 2)}" fill="${fill}" stroke="${hex}" ` +
      `stroke-width="${fmt(sw)}"${rot}/>`
  } else {
    return placeholderSvg(`geo:${String(kind)}`, bounds)
  }
  if (!shape.text) return body
  const fontSize = labelFontSize(shape)
  const lines = wrapText(shape.text, fontSize, Math.max(bounds.w - 2 * LABEL_PADDING, fontSize))
  const inner = {
    x: bounds.x + LABEL_PADDING,
    y: bounds.y + LABEL_PADDING,
    w: bounds.w - 2 * LABEL_PADDING,
    h: bounds.h - 2 * LABEL_PADDING
  }
  const label = textBlockSvg({
    lines,
    box: inner,
    fontSize,
    fill: SCRATCH_COLOR_HEX.black,
    align: alignOf(props, 'align'),
    verticalAlign: alignOf(props, 'verticalAlign')
  })
  return `${body}\n${label}`
}

function noteSvg(shape: ScratchRecord, bounds: ScratchBounds): string {
  const hex = paletteHex(shape.props)
  const rot = rotationAttr(shape, bounds)
  const body =
    `<rect x="${fmt(bounds.x)}" y="${fmt(bounds.y)}" width="${fmt(bounds.w)}" ` +
    `height="${fmt(bounds.h)}" rx="6" fill="${whiteMix(hex, 0.85)}"${rot}/>`
  if (!shape.text) return body
  const fontSize = labelFontSize(shape)
  const lines = wrapText(shape.text, fontSize, Math.max(bounds.w - 2 * LABEL_PADDING, fontSize))
  const label = textBlockSvg({
    lines,
    box: {
      x: bounds.x + LABEL_PADDING,
      y: bounds.y + LABEL_PADDING,
      w: bounds.w - 2 * LABEL_PADDING,
      h: bounds.h - 2 * LABEL_PADDING
    },
    fontSize,
    // Ink is the palette hex pulled toward black, so it reads over the pastel
    // body even for the light colors (yellow, grey).
    fill: whiteMix(hex, -0.45),
    align: alignOf(shape.props, 'align'),
    verticalAlign: alignOf(shape.props, 'verticalAlign')
  })
  return `${body}\n${label}`
}

function textSvg(shape: ScratchRecord, bounds: ScratchBounds): string {
  if (!shape.text) return ''
  const props = shape.props as { size?: unknown; autoSize?: unknown; w?: unknown }
  const fontSize =
    TEXT_FONT_SIZES[typeof props.size === 'string' ? props.size : 'm'] ?? TEXT_FONT_SIZES.m
  // autoSize text keeps its natural lines; fixed-width text wraps like the browser.
  const lines =
    props.autoSize === false && typeof props.w === 'number'
      ? wrapText(shape.text, fontSize, Math.max(props.w, fontSize))
      : shape.text.split('\n')
  return textBlockSvg({
    lines,
    box: bounds,
    fontSize,
    fill: paletteHex(shape.props),
    align: alignOf(shape.props, 'textAlign'),
    verticalAlign: 'start'
  })
}

function drawSvg(shape: ScratchRecord): string {
  const hex = paletteHex(shape.props)
  const sw = strokeWidth(shape.props)
  const segments = (shape.props as { segments?: unknown }).segments
  const pts: Pt[] = []
  if (Array.isArray(segments)) {
    for (const seg of segments) {
      const points = (seg as { points?: unknown })?.points
      if (!Array.isArray(points)) continue
      for (const pt of points) {
        const q = pt as { x?: unknown; y?: unknown }
        if (typeof q.x === 'number' && typeof q.y === 'number') {
          pts.push({ x: shape.x + q.x, y: shape.y + q.y })
        }
      }
    }
  }
  if (pts.length === 0) return ''
  // A single tap leaves one point — draw a dot instead of an empty polyline.
  if (pts.length === 1) {
    return `<circle cx="${fmt(pts[0].x)}" cy="${fmt(pts[0].y)}" r="${fmt(sw / 2)}" fill="${hex}"/>`
  }
  const points = pts.map(q => `${fmt(q.x)},${fmt(q.y)}`).join(' ')
  const closed = (shape.props as { isClosed?: unknown }).isClosed === true
  const tag = closed ? 'polygon' : 'polyline'
  return (
    `<${tag} points="${points}" fill="none" stroke="${hex}" stroke-width="${fmt(sw)}" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>`
  )
}

// resvg decodes png/jpeg/gif but not webp — and tldraw embeds pasted images as
// webp data URLs — so webp is transcoded to a PNG data URL via sharp. Remote
// URLs can't be fetched here; they fall back to a placeholder.
async function imageSvg(
  shape: ScratchRecord,
  bounds: ScratchBounds,
  assets: Map<string, string>
): Promise<string> {
  const assetId = (shape.props as { assetId?: unknown }).assetId
  const src = typeof assetId === 'string' ? assets.get(assetId) : undefined
  if (!src || !src.startsWith('data:')) return placeholderSvg('image', bounds)
  let href = src
  if (src.startsWith('data:image/webp')) {
    const b64 = src.slice(src.indexOf(',') + 1)
    const png = await sharp(Buffer.from(b64, 'base64')).png().toBuffer()
    href = `data:image/png;base64,${png.toString('base64')}`
  }
  return (
    `<image x="${fmt(bounds.x)}" y="${fmt(bounds.y)}" width="${fmt(bounds.w)}" ` +
    `height="${fmt(bounds.h)}" href="${href}" preserveAspectRatio="none"${rotationAttr(shape, bounds)}/>`
  )
}

// ---- Renderer --------------------------------------------------------------------

const CANVAS_PADDING = 48
const MAX_SIDE = 2048

export async function renderScratchpadPng(workspacePath: string): Promise<Uint8Array> {
  const { shapes, bindings, assets } = await readScratchpadRecords(workspacePath)
  if (shapes.length === 0) throw new Error('Canvas is empty')

  // z-order: fractional indexes sort lexicographically.
  const ordered = [...shapes].sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0))

  const boundsById = new Map<string, ScratchBounds>()
  for (const shape of ordered) {
    const b = scratchShapeBounds(shape)
    if (b) boundsById.set(shape.id, b)
  }

  // Canvas bbox: every shape's bounds, plus arrow terminals (arrows have no
  // static bounds of their own).
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const extend = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const arrowGeos = new Map<string, ArrowGeometry>()
  for (const shape of ordered) {
    if (shape.type === 'arrow') {
      const geo = arrowGeometry(shape, bindings, boundsById)
      if (geo) {
        arrowGeos.set(shape.id, geo)
        for (const q of geo.points) extend(q.x, q.y)
        if (geo.ctrl) extend(geo.ctrl.x, geo.ctrl.y)
      }
      continue
    }
    const b = boundsById.get(shape.id)
    if (b) {
      extend(b.x, b.y)
      extend(b.x + b.w, b.y + b.h)
    }
  }
  if (minX === Infinity) throw new Error('Canvas is empty')

  minX -= CANVAS_PADDING
  minY -= CANVAS_PADDING
  const width = Math.ceil(maxX - minX + CANVAS_PADDING)
  const height = Math.ceil(maxY - minY + CANVAS_PADDING)

  const patterns = new Set<string>()
  const body: string[] = []
  for (const shape of ordered) {
    const bounds = boundsById.get(shape.id)
    switch (shape.type) {
      case 'geo':
        body.push(geoSvg(shape, bounds!, patterns))
        break
      case 'note':
        body.push(noteSvg(shape, bounds!))
        break
      case 'text':
        body.push(textSvg(shape, bounds!))
        break
      case 'draw':
        body.push(drawSvg(shape))
        break
      case 'image':
        body.push(await imageSvg(shape, bounds!, assets))
        break
      case 'arrow': {
        const geo = arrowGeos.get(shape.id)
        if (geo) body.push(arrowSvg(shape, geo))
        break
      }
      default:
        body.push(placeholderSvg(shape.type, bounds!))
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="${fmt(minX)} ${fmt(minY)} ${width} ${height}">` +
    `${hatchDefs(patterns)}` +
    `<rect x="${fmt(minX)}" y="${fmt(minY)}" width="${width}" height="${height}" fill="${BACKGROUND}"/>` +
    `${body.join('\n')}</svg>`

  const ttfPath = await ensureFontTtf()
  const resvg = new Resvg(svg, {
    font: { fontFiles: [ttfPath], loadSystemFonts: false, defaultFontFamily: FONT_FAMILY },
    // Cap the long side — a sprawling canvas rasterizes to a bounded PNG.
    ...(Math.max(width, height) > MAX_SIDE
      ? {
          fitTo: {
            mode: width >= height ? ('width' as const) : ('height' as const),
            value: MAX_SIDE
          }
        }
      : {})
  })
  return new Uint8Array(resvg.render().asPng())
}
