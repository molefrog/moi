import type { ScratchColor } from './types'

// The Scratchpad palette (matches the UI toolbar's six swatches) and each color's
// light-theme solid hex. The CLI uses it to snap an arbitrary `--color #rrggbb`
// to the nearest palette entry (tldraw shapes can't hold free hex); the server
// renderer uses it to paint those palette colors back into pixels. Keep in sync
// with the swatches in client/components/Scratchpad.tsx.
export const SCRATCH_COLOR_HEX: Record<ScratchColor, string> = {
  black: '#1d1d1d',
  red: '#e03131',
  yellow: '#f1ac4b',
  green: '#099268',
  blue: '#4465e9',
  grey: '#9fa8b2'
}
