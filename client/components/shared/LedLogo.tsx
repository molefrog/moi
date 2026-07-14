import { useEffect, useState } from 'react'

import { cn } from '@/client/lib/cn'

// A sprite is a glyph (and sets the grid dimensions). An effect is an optional
// animation rendered at the sprite's dimensions.
export type Sprite = 'moi' | 'moi-full'
export type Effect = 'wave' | 'chaos'

const parse = (rows: string[]): number[][] =>
  rows.map(row => [...row].map(ch => (ch === '#' ? 1 : 0)))

// "moi" glyphs — 5×5 each, hand-painted in the playground.
const M_ROWS = ['####.', '#.#.#', '#.#.#', '#.#.#', '#.#.#']
const PART2_ROWS = ['###.#', '#.#.#', '#.#.#', '#.#.#', '###.#']

// Small standalone M (sits a row lower).
const M = parse(['.....', '####.', '#.#.#', '#.#.#', '#.#.#'])
// Full mark: M + a 1-column gap + the second glyph.
const MOI_FULL = parse(M_ROWS.map((row, i) => `${row}.${PART2_ROWS[i]}`))

const SPRITES: Record<Sprite, number[][]> = {
  moi: M,
  'moi-full': MOI_FULL
}

// ---- frame generators (sized to the sprite's W×H) --------------------------

function makeGrid(w: number, h: number, fn: (c: number, r: number) => number): number[][] {
  const grid: number[][] = []
  for (let r = 0; r < h; r++) {
    const row: number[] = []
    for (let c = 0; c < w; c++) row.push(fn(c, r))
    grid.push(row)
  }
  return grid
}

// Deterministic per-cell pseudo-random in [0,1) — lets effects run at any
// sprite dimension without a fixed-size parameter table.
function hash(c: number, r: number, seed: number): number {
  const x = Math.sin(c * 12.9898 + r * 78.233 + seed * 37.719) * 43758.5453
  return x - Math.floor(x)
}

// Smooth twinkle: each pixel breathes on its own slow cycle (fairy lights),
// squared so peaks pop bright while most sit dim.
function chaosFrame(t: number, w: number, h: number): number[][] {
  return makeGrid(w, h, (c, r) => {
    const phase = hash(c, r, 0) * Math.PI * 2
    const speed = 5 + hash(c, r, 1) * 6
    const v = 0.5 + 0.5 * Math.sin(t * speed + phase)
    return v * v
  })
}

// Smooth diagonal travelling wave.
function waveFrame(t: number, w: number, h: number): number[][] {
  const speed = 6.5
  return makeGrid(w, h, (c, r) => 0.5 + 0.5 * Math.sin(c * 0.5 + r * 0.32 - t * speed))
}

// A sprite sliding up from below into place, then static.
const SLIDE_SECONDS = 0.55
function spriteSlide(pattern: number[][], t: number): number[][] {
  const h = pattern.length
  const w = pattern.reduce((m, row) => Math.max(m, row.length), 0)
  const p = Math.min(t / SLIDE_SECONDS, 1)
  const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
  const drop = Math.round((1 - eased) * h) // h → 0
  const out: number[][] = []
  for (let r = 0; r < h; r++) {
    const row: number[] = []
    for (let c = 0; c < w; c++) row.push(pattern[r - drop]?.[c] ?? 0)
    out.push(row)
  }
  return out
}

function frameFor(sprite: Sprite, effect: Effect | undefined, t: number): number[][] {
  const base = SPRITES[sprite]
  if (effect === undefined) return spriteSlide(base, t)
  const h = base.length
  const w = base[0]?.length ?? 0
  return effect === 'wave' ? waveFrame(t, w, h) : chaosFrame(t, w, h)
}

// Default target frame rate; overridable via the `fps` prop.
const DEFAULT_FPS = 24

// ---- animation hook: owns the rAF lifecycle --------------------------------

function useLedFrames(sprite: Sprite, effect: Effect | undefined, fps: number): number[][] {
  const [grid, setGrid] = useState<number[][]>(() => frameFor(sprite, effect, 0))

  useEffect(() => {
    let raf = 0
    let start: number | null = null
    let last = 0
    const interval = 1000 / fps

    const loop = (now: number) => {
      if (start === null) start = now
      const t = (now - start) / 1000
      if (now - last >= interval) {
        last = now
        setGrid(frameFor(sprite, effect, t))
        // A static sprite (no effect) stops once it has slid into place.
        if (effect === undefined && t >= SLIDE_SECONDS) return
      }
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [sprite, effect, fps])

  return grid
}

// Brightness [0,1] → ink color. Continuous so waves read as gradients while
// the off baseline keeps the matrix faintly visible.
function pixelColor(v: number): string {
  const a = 0.1 + Math.max(0, Math.min(1, v)) * 0.9
  return `rgba(23, 23, 23, ${a.toFixed(3)})`
}

type LedLogoProps = {
  /** Which glyph to show; also sets the grid dimensions. Default 'moi'. */
  sprite?: Sprite
  /** Optional animation, sized to the sprite. Omit for the static sprite. */
  effect?: Effect
  /** Target frames per second. Default 24. */
  fps?: number
  /** Square pixel edge in px. Default 3. */
  pixelSize?: number
  /** Spacing between pixels in px. Default 1. */
  gap?: number
  className?: string
}

export function LedLogo({
  sprite = 'moi',
  effect,
  fps = DEFAULT_FPS,
  pixelSize = 3,
  gap = 1,
  className
}: LedLogoProps) {
  const grid = useLedFrames(sprite, effect, fps)
  const cols = grid[0]?.length ?? 0
  // Effects glow; the static sprite stays crisp.
  const bloom = effect !== undefined
  return (
    <div
      className={cn('grid', className)}
      style={{
        gridTemplateColumns: `repeat(${cols}, ${pixelSize}px)`,
        gap: `${gap}px`
      }}
    >
      {grid.flatMap((row, r) =>
        row.map((v, c) => (
          <div
            key={`${r}-${c}`}
            className="rounded-[2px]"
            style={{
              width: pixelSize,
              height: pixelSize,
              background: pixelColor(v),
              // Soft bloom that grows with brightness — bright pixels glow.
              boxShadow: bloom
                ? `0 0 ${(pixelSize * (0.4 + v)).toFixed(1)}px rgba(23, 23, 23, ${(v * 0.35).toFixed(3)})`
                : undefined
            }}
          />
        ))
      )}
    </div>
  )
}
