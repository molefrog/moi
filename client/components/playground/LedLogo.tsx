import { useEffect, useState } from 'react'

import { cn } from '@/client/lib/cn'

export type LedMode = 'moi' | 'moi2' | 'wave' | 'chaos'

const WIDTH = 16
const HEIGHT = 8

const parse = (rows: string[]): number[][] =>
  rows.map(row => [...row].map(ch => (ch === '#' ? 1 : 0)))

// "MOI" v1 — 16×8 screen, 6-tall wordmark centered (1 padding row top/bottom).
const MOI = parse([
  '................',
  '..#...#..##..#..',
  '..##.##.#..#.#..',
  '..#.#.#.#..#.#..',
  '..#...#.#..#.#..',
  '..#...#.#..#.#..',
  '..#...#..##..#..',
  '................'
])

// "moi" v2 — same 16×8 screen, no padding: thick strokes filling the whole screen.
const MOI2 = parse([
  '########.#####.#',
  '########.#####.#',
  '##.##.##.##.##.#',
  '##.##.##.##.##.#',
  '##.##.##.##.##.#',
  '##.##.##.##.##.#',
  '##.##.##.#####.#',
  '##.##.##.#####.#'
])

// ---- frame generators ------------------------------------------------------
// Each returns a fresh HEIGHT×WIDTH grid of brightness values in [0, 1].

function makeGrid(fn: (c: number, r: number) => number): number[][] {
  const grid: number[][] = []
  for (let r = 0; r < HEIGHT; r++) {
    const row: number[] = []
    for (let c = 0; c < WIDTH; c++) row.push(fn(c, r))
    grid.push(row)
  }
  return grid
}

// Per-pixel twinkle params (generated once). Each pixel breathes on its own
// slow sine cycle, so the field shimmers smoothly like fairy lights instead of
// flickering like TV static.
const TWINKLE_PHASE: number[][] = []
const TWINKLE_SPEED: number[][] = []
for (let r = 0; r < HEIGHT; r++) {
  TWINKLE_PHASE[r] = []
  TWINKLE_SPEED[r] = []
  for (let c = 0; c < WIDTH; c++) {
    TWINKLE_PHASE[r][c] = Math.random() * Math.PI * 2
    TWINKLE_SPEED[r][c] = 2 + Math.random() * 3.2
  }
}

// Smooth twinkle: each pixel fades in/out on its own cycle; squared so peaks
// pop bright while most sit dim (the fairy-light look).
function chaosFrame(t: number): number[][] {
  return makeGrid((c, r) => {
    const v = 0.5 + 0.5 * Math.sin(t * TWINKLE_SPEED[r][c] + TWINKLE_PHASE[r][c])
    return v * v
  })
}

// Smooth diagonal travelling wave.
function waveFrame(t: number): number[][] {
  const speed = 6.5
  return makeGrid((c, r) => 0.5 + 0.5 * Math.sin(c * 0.5 + r * 0.32 - t * speed))
}

// A wordmark sliding up from below into place, then static. Works for any
// pattern size, so both MOI versions share it.
const SLIDE_SECONDS = 0.55
function moiSlide(pattern: number[][], t: number): number[][] {
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

function frameFor(mode: LedMode, t: number): number[][] {
  if (mode === 'chaos') return chaosFrame(t)
  if (mode === 'wave') return waveFrame(t)
  if (mode === 'moi2') return moiSlide(MOI2, t)
  return moiSlide(MOI, t)
}

// Default target frame rate; overridable via the `fps` prop.
const DEFAULT_FPS = 24

// ---- animation hook: owns the rAF lifecycle --------------------------------

function useLedFrames(mode: LedMode, fps: number): number[][] {
  const [grid, setGrid] = useState<number[][]>(() => frameFor(mode, 0))

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
        setGrid(frameFor(mode, t))
        // The wordmark stops animating once it has settled.
        if ((mode === 'moi' || mode === 'moi2') && t >= SLIDE_SECONDS) return
      }
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [mode, fps])

  return grid
}

// Brightness [0,1] → ink color. Continuous so waves read as gradients while
// the off baseline keeps the matrix faintly visible.
function pixelColor(v: number): string {
  const a = 0.07 + Math.max(0, Math.min(1, v)) * 0.93
  return `rgba(23, 23, 23, ${a.toFixed(3)})`
}

type LedLogoProps = {
  mode?: LedMode
  /** Target frames per second. Default 24. */
  fps?: number
  /** Square pixel edge in px. Default 3. */
  pixelSize?: number
  /** Spacing between pixels in px. Default 1. */
  gap?: number
  className?: string
}

export function LedLogo({
  mode = 'moi',
  fps = DEFAULT_FPS,
  pixelSize = 3,
  gap = 1,
  className
}: LedLogoProps) {
  const grid = useLedFrames(mode, fps)
  const cols = grid[0]?.length ?? 0
  // Bloom suits the glowing animated modes; the wordmarks stay crisp.
  const bloom = mode !== 'moi' && mode !== 'moi2'
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
            className="rounded-[1px]"
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
