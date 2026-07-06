import type { ScratchColor, ScratchFill, ScratchSize } from '@/lib/types'

// Shared parsing for the Scratchpad's user-facing style vocabulary (colors,
// fills, stroke/font sizes). Two consumers: the `moi scratch` CLI flags and the
// `diagram` spec compiler (server/scratchpad-diagram.ts) — both accept the same
// names, so the palette and its parse rules live here once.

// The Scratchpad palette (matches the UI toolbar's six swatches) and each color's
// light-theme solid hex — used to snap an arbitrary `#rrggbb` to the nearest
// palette entry (tldraw shapes can't hold free hex). Keep in sync with the swatches
// in client/components/Scratchpad.tsx.
export const COLOR_HEX: Record<ScratchColor, string> = {
  black: '#1d1d1d',
  red: '#e03131',
  yellow: '#f1ac4b',
  green: '#099268',
  blue: '#4465e9',
  grey: '#9fa8b2'
}
export const COLOR_NAMES = Object.keys(COLOR_HEX) as ScratchColor[]

// Arrows expose tldraw's size as a line weight; the CLI mirrors the UI's two sizes.
export const STROKE_SIZES: Record<string, ScratchSize> = { small: 'm', large: 'xl' }
export const STROKE_NAMES = Object.keys(STROKE_SIZES)

// Text & notes expose the same size style as a label font size, under friendlier names.
export const FONT_SIZES: Record<string, ScratchSize> = { regular: 'm', big: 'xl' }
export const FONT_SIZE_NAMES = Object.keys(FONT_SIZES)

// Rectangle fills — the UI toolbar's four options. Each user-facing name maps onto a
// tldraw DefaultFillStyle value (see ScratchFill for tldraw's semi/solid quirk). Keep
// in sync with FILL_OPTIONS in client/components/Scratchpad.tsx.
export const FILL_STYLES: Record<string, ScratchFill> = {
  none: 'none',
  semi: 'solid',
  pattern: 'pattern',
  solid: 'fill'
}
export const FILL_NAMES = Object.keys(FILL_STYLES)

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.replace(/(.)/g, '$1$1')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// Accept a palette name as-is, or snap any hex to the nearest palette color by
// squared RGB distance. Throws on anything else.
export function parseColor(s: string): ScratchColor {
  const lower = s.trim().toLowerCase()
  if ((COLOR_NAMES as string[]).includes(lower)) return lower as ScratchColor
  const rgb = hexToRgb(s)
  if (!rgb) {
    throw new Error(
      `Unknown color "${s}". Use a hex like "#4465e9" or one of: ${COLOR_NAMES.join(', ')}.`
    )
  }
  let best: ScratchColor = 'black'
  let bestDist = Infinity
  for (const name of COLOR_NAMES) {
    const [r, g, b] = hexToRgb(COLOR_HEX[name])!
    const d = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2
    if (d < bestDist) {
      bestDist = d
      best = name
    }
  }
  return best
}

export function parseStroke(s: string): ScratchSize {
  const size = STROKE_SIZES[s.trim().toLowerCase()]
  if (!size) throw new Error(`Unknown stroke "${s}". Use one of: ${STROKE_NAMES.join(', ')}.`)
  return size
}

export function parseFontSize(s: string): ScratchSize {
  const size = FONT_SIZES[s.trim().toLowerCase()]
  if (!size) throw new Error(`Unknown font size "${s}". Use one of: ${FONT_SIZE_NAMES.join(', ')}.`)
  return size
}

export function parseFill(s: string): ScratchFill {
  const fill = FILL_STYLES[s.trim().toLowerCase()]
  if (!fill) throw new Error(`Unknown fill "${s}". Use one of: ${FILL_NAMES.join(', ')}.`)
  return fill
}
