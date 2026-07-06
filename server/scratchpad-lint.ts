import type { ScratchLintFinding } from '@/lib/types'

import {
  type ScratchBounds,
  type ScratchRecord,
  labelFontSize,
  readScratchpadRecords,
  scratchShapeBounds
} from './scratchpad'
import { LABEL_PADDING, fitRectToLabel, measureLine, textBlockSize } from './scratchpad-metrics'

// Read-only geometry lint for the Scratchpad: the machine-checkable half of
// "looks off". Every check works off the disk snapshot (no browser, no store
// mutation) and measures text with the real canvas font, so overflow is fact,
// not guess. Findings are advisory — each carries a ready-to-run `moi scratch`
// fix where one is mechanical. Tuned against nagging: warn-level codes are
// capped per run, and an overlapping pair is never also flagged as misaligned.

// Warn-level chatter cap per code — a messy canvas should surface its worst
// offenders, not a hundred near-misses.
const MAX_WARN_FINDINGS = 10
// Edges/centers this close (but not equal) were probably *meant* to align.
const NEAR_MISALIGN_PX = 10
// Row/column gap spread beyond this reads as uneven spacing.
const GAP_SPREAD_PX = 12
// One shape covering ≥ this fraction of another is grouping, not collision.
const CONTAINMENT_RATIO = 0.9
// Clearance suggested when pushing an overlapping shape out of the way.
const OVERLAP_GAP = 16

type Boxed = { shape: ScratchRecord; b: ScratchBounds }

const fmtN = (n: number) => String(Math.round(n * 10) / 10)
const fmtXY = (x: number, y: number) => `${fmtN(x)},${fmtN(y)}`

function intersection(a: ScratchBounds, b: ScratchBounds): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

// ---- text-overflow -----------------------------------------------------------------

// A geo rect whose label, wrapped at the rect's inner width, needs more height
// than the rect has — or contains a single word wider than the inner width (it
// would hard-break mid-word, the "localhost:30 00" bug). The fix is the exact
// resize `fitRectToLabel` computes, never narrower than the current rect.
function checkTextOverflow(boxed: Boxed[]): ScratchLintFinding[] {
  const findings: ScratchLintFinding[] = []
  for (const { shape, b } of boxed) {
    if (shape.type !== 'geo' || !shape.text) continue
    const geo = (shape.props as { geo?: unknown }).geo
    if (geo !== undefined && geo !== 'rectangle') continue
    const fontSize = labelFontSize(shape)
    const innerW = b.w - 2 * LABEL_PADDING
    const innerH = b.h - 2 * LABEL_PADDING
    const block = textBlockSize(shape.text, fontSize, Math.max(innerW, fontSize))
    const wordTooWide = shape.text
      .split(/\s+/)
      .some(word => word.length > 0 && measureLine(word, fontSize) > innerW)
    if (block.h <= innerH && !wordTooWide) continue
    const sizeToken = (shape.props as { size?: unknown }).size
    const fit = fitRectToLabel(shape.text, {
      ...(typeof sizeToken === 'string' ? { size: sizeToken } : {}),
      targetWidth: Math.max(innerW, 240),
      minW: b.w
    })
    findings.push({
      code: 'text-overflow',
      severity: 'error',
      ids: [shape.id],
      message:
        `label of "${shape.id}" overflows its ${fmtN(b.w)}×${fmtN(b.h)} rect ` +
        `(needs ${fmtN(fit.w)}×${fmtN(fit.h)})`,
      fix: `moi scratch resize ${shape.id} --size ${fit.w},${fit.h}`
    })
  }
  return findings
}

// ---- overlap -------------------------------------------------------------------------

// Two shapes colliding where neither ~contains the other. Full containment is
// intentional grouping (a labeled container around its members) and is skipped.
// Arrows and freehand strokes never reach here — the entry point filters them
// out (arrows are supposed to cross shapes; strokes annotate over everything).
function checkOverlap(boxed: Boxed[]): ScratchLintFinding[] {
  const findings: ScratchLintFinding[] = []
  for (let i = 0; i < boxed.length; i++) {
    for (let j = i + 1; j < boxed.length; j++) {
      const A = boxed[i]
      const B = boxed[j]
      const inter = intersection(A.b, B.b)
      if (inter <= 0) continue
      const areaA = A.b.w * A.b.h
      const areaB = B.b.w * B.b.h
      if (inter >= CONTAINMENT_RATIO * Math.min(areaA, areaB)) continue
      // Push the smaller shape out along the axis of least overlap, away from
      // the larger one's center — the smallest concrete move that separates them.
      const [small, large] = areaA <= areaB ? [A, B] : [B, A]
      const overlapX = Math.min(A.b.x + A.b.w, B.b.x + B.b.w) - Math.max(A.b.x, B.b.x)
      const overlapY = Math.min(A.b.y + A.b.h, B.b.y + B.b.h) - Math.max(A.b.y, B.b.y)
      const smallCx = small.b.x + small.b.w / 2
      const smallCy = small.b.y + small.b.h / 2
      const largeCx = large.b.x + large.b.w / 2
      const largeCy = large.b.y + large.b.h / 2
      let toX = small.shape.x
      let toY = small.shape.y
      if (overlapX <= overlapY) {
        toX += (smallCx >= largeCx ? 1 : -1) * (overlapX + OVERLAP_GAP)
      } else {
        toY += (smallCy >= largeCy ? 1 : -1) * (overlapY + OVERLAP_GAP)
      }
      findings.push({
        code: 'overlap',
        severity: 'error',
        ids: [A.shape.id, B.shape.id],
        message: `"${A.shape.id}" and "${B.shape.id}" overlap`,
        fix: `moi scratch move ${small.shape.id} --to ${fmtXY(toX, toY)}`
      })
    }
  }
  return findings
}

// ---- near-misalign ---------------------------------------------------------------------

type AlignAxis = {
  label: string
  // Value compared between the two shapes.
  value: (x: Boxed) => number
  // New shape origin for `b` that makes its value equal `a`'s.
  align: (a: Boxed, b: Boxed) => { x: number; y: number }
}

const ALIGN_AXES: AlignAxis[] = [
  {
    label: 'left edges',
    value: s => s.b.x,
    align: (a, b) => ({ x: b.shape.x + (a.b.x - b.b.x), y: b.shape.y })
  },
  {
    label: 'horizontal centers',
    value: s => s.b.x + s.b.w / 2,
    align: (a, b) => ({ x: b.shape.x + (a.b.x + a.b.w / 2 - (b.b.x + b.b.w / 2)), y: b.shape.y })
  },
  {
    label: 'top edges',
    value: s => s.b.y,
    align: (a, b) => ({ x: b.shape.x, y: b.shape.y + (a.b.y - b.b.y) })
  },
  {
    label: 'vertical centers',
    value: s => s.b.y + s.b.h / 2,
    align: (a, b) => ({ x: b.shape.x, y: b.shape.y + (a.b.y + a.b.h / 2 - (b.b.y + b.b.h / 2)) })
  }
]

// A pair that *almost* lines up — off by ≤10px on an edge or center — was
// probably meant to align exactly. One finding per pair (the closest axis wins).
// Intersecting pairs are skipped entirely: a true overlap is already an error
// (never doubled with a misalign warn), and a contained shape sitting near its
// container's edge is layout, not a slip.
function checkNearMisalign(boxed: Boxed[]): ScratchLintFinding[] {
  const scored: { finding: ScratchLintFinding; diff: number }[] = []
  for (let i = 0; i < boxed.length; i++) {
    for (let j = i + 1; j < boxed.length; j++) {
      const a = boxed[i]
      const b = boxed[j]
      if (intersection(a.b, b.b) > 0) continue
      let best: { axis: AlignAxis; diff: number } | undefined
      for (const axis of ALIGN_AXES) {
        const diff = Math.abs(axis.value(a) - axis.value(b))
        if (diff > 0 && diff <= NEAR_MISALIGN_PX && (!best || diff < best.diff)) {
          best = { axis, diff }
        }
      }
      if (!best) continue
      const to = best.axis.align(a, b)
      scored.push({
        diff: best.diff,
        finding: {
          code: 'near-misalign',
          severity: 'warn',
          ids: [a.shape.id, b.shape.id],
          message:
            `${best.axis.label} of "${a.shape.id}" and "${b.shape.id}" differ ` +
            `by ${fmtN(best.diff)}px`,
          fix: `moi scratch move ${b.shape.id} --to ${fmtXY(to.x, to.y)}`
        }
      })
    }
  }
  // Worst offenders = the closest near-misses (a 1px slip is almost certainly a
  // mistake; 9px might be intentional). Cap so a messy canvas doesn't nag.
  scored.sort((a, b) => a.diff - b.diff)
  return scored.slice(0, MAX_WARN_FINDINGS).map(s => s.finding)
}

// ---- uneven-gaps ----------------------------------------------------------------------

// Detect rows (shapes whose vertical extents mutually overlap ≥50%) and columns
// (the transpose) of ≥3 shapes, and flag runs whose consecutive gaps vary by
// more than the threshold. The fix redistributes to the median gap, keeping the
// first shape put. Shapes contained inside another (grouped) sit in *their
// container's* layout, not the page row — they'd register as negative gaps
// against their container, so they're left out.
function checkUnevenGaps(all: Boxed[]): ScratchLintFinding[] {
  const boxed = all.filter(
    s =>
      !all.some(
        t =>
          t !== s &&
          t.b.w * t.b.h > s.b.w * s.b.h &&
          intersection(s.b, t.b) >= CONTAINMENT_RATIO * s.b.w * s.b.h
      )
  )
  const findings: ScratchLintFinding[] = []
  const overlapRatio = (a: [number, number], b: [number, number]) => {
    const inter = Math.min(a[1], b[1]) - Math.max(a[0], b[0])
    return inter / Math.max(Math.min(a[1] - a[0], b[1] - b[0]), 1)
  }

  const detect = (
    axis: 'row' | 'column',
    extent: (s: Boxed) => [number, number],
    start: (s: Boxed) => number,
    size: (s: Boxed) => number
  ) => {
    // Greedy clustering along the run direction: a shape joins the group when
    // its cross-axis extent overlaps the previous member's by ≥50%.
    const sorted = [...boxed].sort((a, b) => start(a) - start(b))
    const used = new Set<string>()
    for (const seed of sorted) {
      if (used.has(seed.shape.id)) continue
      const group = [seed]
      for (const cand of sorted) {
        if (cand === seed || used.has(cand.shape.id)) continue
        if (overlapRatio(extent(group[group.length - 1]), extent(cand)) >= 0.5) {
          group.push(cand)
        }
      }
      if (group.length < 3) continue
      group.forEach(g => used.add(g.shape.id))
      // Chaining can pull in a member that starts before the seed (when the
      // seed's own earlier group fell short) — re-sort so gaps are consecutive.
      group.sort((a, b) => start(a) - start(b))
      const gaps: number[] = []
      for (let i = 0; i < group.length - 1; i++) {
        gaps.push(start(group[i + 1]) - (start(group[i]) + size(group[i])))
      }
      // A negative gap means two members overlap along the run direction —
      // that's not a row/column (and any true collision is already an overlap
      // error), so the group isn't a spacing candidate at all.
      if (gaps.some(g => g < 0)) continue
      const spread = Math.max(...gaps) - Math.min(...gaps)
      if (spread <= GAP_SPREAD_PX) continue
      const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
      // Re-lay the run: first shape stays, each next sits `median` past the last.
      const moves: string[] = []
      let cursor = start(group[0]) + size(group[0])
      for (let i = 1; i < group.length; i++) {
        const g = group[i]
        const delta = cursor + median - start(g)
        cursor = start(g) + delta + size(g)
        if (Math.abs(delta) < 0.5) continue
        const toX = axis === 'row' ? g.shape.x + delta : g.shape.x
        const toY = axis === 'row' ? g.shape.y : g.shape.y + delta
        moves.push(`moi scratch move ${g.shape.id} --to ${fmtXY(toX, toY)}`)
      }
      findings.push({
        code: 'uneven-gaps',
        severity: 'warn',
        ids: group.map(g => g.shape.id),
        message:
          `uneven ${axis === 'row' ? 'horizontal' : 'vertical'} gaps in ${axis} ` +
          `${group.map(g => `"${g.shape.id}"`).join(', ')} ` +
          `(${gaps.map(g => fmtN(g)).join('px, ')}px)`,
        ...(moves.length > 0 ? { fix: moves.join('; ') } : {})
      })
    }
  }

  detect(
    'row',
    s => [s.b.y, s.b.y + s.b.h],
    s => s.b.x,
    s => s.b.w
  )
  detect(
    'column',
    s => [s.b.x, s.b.x + s.b.w],
    s => s.b.y,
    s => s.b.h
  )
  return findings.slice(0, MAX_WARN_FINDINGS)
}

// ---- entry ---------------------------------------------------------------------------

export async function lintScratchpad(workspacePath: string): Promise<ScratchLintFinding[]> {
  const { shapes } = await readScratchpadRecords(workspacePath)
  // Arrows have no static bounds and freehand strokes are annotation — geometry
  // checks run over the "layout" shapes: rects, notes, text, images.
  const boxed: Boxed[] = []
  for (const shape of shapes) {
    if (shape.type === 'arrow' || shape.type === 'draw') continue
    const b = scratchShapeBounds(shape)
    if (b && b.w > 0 && b.h > 0) boxed.push({ shape, b })
  }

  return [
    ...checkTextOverflow(boxed),
    ...checkOverlap(boxed),
    ...checkNearMisalign(boxed),
    ...checkUnevenGaps(boxed)
  ]
}
