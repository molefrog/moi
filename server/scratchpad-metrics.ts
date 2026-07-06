// Sync read: the font loads lazily on first measurement, and callers are sync.
import { readFileSync } from 'node:fs'

import { create } from 'fontkit'

// Server-side text measurement for the Scratchpad. The agent draws through a
// headless tldraw store (no DOM), so nothing measures text for it — which is why
// agent-drawn labels historically overflowed their boxes. This module measures
// strings with the *actual* font the canvas renders (tldraw's draw font, Shantell
// Sans Informal), so the server can size shapes to fit their text before they
// ever hit the canvas.
//
// The font file ships in `@tldraw/assets` (version-matched to our tldraw dep);
// fontkit reads the woff2 directly and gives exact advance widths. If the font
// can't be loaded for any reason we fall back to a character-class heuristic —
// coarser, but still far better than guessing.

// tldraw's shape font sizes, in px. These mirror `FONT_SIZES` / `LABEL_FONT_SIZES`
// / `ARROW_LABEL_FONT_SIZES` in tldraw's default-shape-constants.ts (rem values ×
// the default 16px theme font size) — they're not exported from the package, so
// they're pinned here. Line height and label padding likewise.
export const TEXT_FONT_SIZES: Record<string, number> = { s: 18, m: 24, l: 36, xl: 44 }
export const LABEL_FONT_SIZES: Record<string, number> = { s: 18, m: 22, l: 26, xl: 32 }
export const ARROW_LABEL_FONT_SIZES: Record<string, number> = { s: 18, m: 20, l: 24, xl: 28 }
export const LINE_HEIGHT = 1.35
export const LABEL_PADDING = 16

// Measured widths differ slightly from the browser's shaping (kerning model,
// subpixel rounding), so pad every measurement by a hair — overestimating keeps
// labels inside their boxes, which is the failure mode that matters.
const SAFETY = 1.04

type MeasuringFont = {
  layout(text: string): { advanceWidth: number }
  unitsPerEm: number
}

let cachedFont: MeasuringFont | null | undefined
function loadFont(): MeasuringFont | null {
  if (cachedFont !== undefined) return cachedFont
  try {
    const path = Bun.resolveSync(
      '@tldraw/assets/fonts/Shantell_Sans-Informal_Regular.woff2',
      import.meta.dir
    )
    cachedFont = create(readFileSync(path)) as unknown as MeasuringFont
  } catch {
    cachedFont = null
  }
  return cachedFont
}

// Rough per-character width factors (× font size) when the real font is missing.
// Calibrated against Shantell Sans: average lowercase ≈ 0.55em, caps ≈ 0.72em.
function heuristicWidth(text: string, fontSize: number): number {
  let units = 0
  for (const ch of text) {
    if (/[iIljtf.,:;'|!]/.test(ch)) units += 0.32
    else if (/[mwMW@]/.test(ch)) units += 0.95
    else if (/[A-Z0-9]/.test(ch)) units += 0.72
    else if (ch === ' ') units += 0.34
    else units += 0.55
  }
  return units * fontSize
}

/** Width in px of a single line of text at `fontSize` px in the canvas draw font. */
export function measureLine(text: string, fontSize: number): number {
  if (text.length === 0) return 0
  const font = loadFont()
  if (!font) return heuristicWidth(text, fontSize) * SAFETY
  const run = font.layout(text)
  return (run.advanceWidth / font.unitsPerEm) * fontSize * SAFETY
}

// Split one long word at the last glyph that still fits maxWidth (tldraw
// breaks overflowing words the same way). Always consumes ≥1 char.
function breakWord(word: string, fontSize: number, maxWidth: number): [string, string] {
  let end = 1
  for (let i = 2; i <= word.length; i++) {
    if (measureLine(word.slice(0, i), fontSize) > maxWidth) break
    end = i
  }
  return [word.slice(0, end), word.slice(end)]
}

/**
 * Greedy word-wrap of `text` at `maxWidth` px, honoring explicit newlines.
 * Words longer than the full width are broken mid-word, like the browser does.
 */
export function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(w => w.length > 0)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let line = ''
    let queue = [...words]
    while (queue.length > 0) {
      const word = queue.shift()!
      const candidate = line.length === 0 ? word : `${line} ${word}`
      if (measureLine(candidate, fontSize) <= maxWidth) {
        line = candidate
        continue
      }
      if (line.length > 0) {
        lines.push(line)
        line = ''
        queue.unshift(word)
        continue
      }
      // Single word wider than the line: hard-break it.
      const [head, rest] = breakWord(word, fontSize, maxWidth)
      lines.push(head)
      if (rest.length > 0) queue.unshift(rest)
    }
    if (line.length > 0) lines.push(line)
  }
  return lines
}

export type TextBlockSize = { w: number; h: number; lines: string[] }

/**
 * Size of a text block at `fontSize` px: unwrapped natural size, or wrapped at
 * `maxWidth` when given. Height uses tldraw's 1.35 line height.
 */
export function textBlockSize(text: string, fontSize: number, maxWidth?: number): TextBlockSize {
  const lines =
    maxWidth === undefined
      ? text.split('\n')
      : wrapText(text, fontSize, Math.max(maxWidth, fontSize))
  const w = Math.max(...lines.map(line => measureLine(line, fontSize)), 0)
  const h = Math.max(lines.length, 1) * fontSize * LINE_HEIGHT
  return { w, h, lines }
}

export type FitRectOptions = {
  /** tldraw size token for the label ('s' | 'm' | 'l' | 'xl'); default 'm'. */
  size?: string
  /** Preferred max label width in px before wrapping; default 240. */
  targetWidth?: number
  minW?: number
  minH?: number
  /** Round the result up to a multiple of this; default 8. */
  grid?: number
}

/**
 * The smallest rect (w, h) whose centered label fits without overflowing —
 * label wrapped at `targetWidth`, padded with tldraw's LABEL_PADDING on every
 * side, then rounded up to the grid. This is how a box should be sized *before*
 * placing it, instead of eyeballing and overflowing.
 */
export function fitRectToLabel(text: string, opts: FitRectOptions = {}): { w: number; h: number } {
  const fontSize = LABEL_FONT_SIZES[opts.size ?? 'm'] ?? LABEL_FONT_SIZES.m
  const targetWidth = opts.targetWidth ?? 240
  const grid = opts.grid ?? 8
  const minW = opts.minW ?? 80
  const minH = opts.minH ?? 48
  const block = textBlockSize(text, fontSize, targetWidth)
  const roundUp = (v: number) => Math.ceil(v / grid) * grid
  return {
    w: roundUp(Math.max(block.w + LABEL_PADDING * 2, minW)),
    h: roundUp(Math.max(block.h + LABEL_PADDING * 2, minH))
  }
}

/** True when the real canvas font loaded (tests assert this so we notice regressions). */
export function fontAvailable(): boolean {
  return loadFont() !== null
}
