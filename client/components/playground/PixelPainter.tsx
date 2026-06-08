import { useEffect, useRef, useState } from 'react'

import { cn } from '@/client/lib/cn'

const COLS = 5
const ROWS = 5

// Seed with the current M.
const SEED = ['.....', '####.', '#.#.#', '#.#.#', '#.#.#']

function fromRows(rows: string[]): boolean[][] {
  return rows.map(row => [...row].map(ch => ch === '#'))
}

function emptyGrid(): boolean[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false))
}

// Simple 9×6 pixel painter: click or drag to toggle cells, then copy the
// `#`/`.` rows. Used to author the LED glyph by hand.
export function PixelPainter() {
  const [grid, setGrid] = useState<boolean[][]>(() => fromRows(SEED))
  const [painting, setPainting] = useState(false)
  const paintValue = useRef(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const stop = () => setPainting(false)
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  function setCell(r: number, c: number, value: boolean) {
    setGrid(g => {
      if (g[r][c] === value) return g
      const next = g.map(row => row.slice())
      next[r][c] = value
      return next
    })
  }

  function handleDown(r: number, c: number) {
    const value = !grid[r][c]
    paintValue.current = value
    setPainting(true)
    setCell(r, c, value)
  }

  function handleEnter(r: number, c: number) {
    if (painting) setCell(r, c, paintValue.current)
  }

  const ascii = grid.map(row => row.map(on => (on ? '#' : '.')).join('')).join('\n')

  async function copy() {
    await navigator.clipboard.writeText(ascii)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="grid w-fit grid-cols-[repeat(5,28px)] gap-px bg-black/15 p-px select-none">
        {grid.map((row, r) =>
          row.map((on, c) => (
            <div
              key={`${r}-${c}`}
              onMouseDown={() => handleDown(r, c)}
              onMouseEnter={() => handleEnter(r, c)}
              className={cn('size-7 cursor-pointer', on ? 'bg-neutral-900' : 'bg-white')}
            />
          ))
        )}
      </div>

      <pre className="rounded-md border border-border bg-white px-3 py-2 text-center font-mono text-sm leading-snug text-neutral-900">
        {ascii}
      </pre>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={() => setGrid(emptyGrid())}
          className="rounded-md bg-black/[0.06] px-3 py-1 text-xs font-medium text-black/60 hover:text-black/80"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => setGrid(fromRows(SEED))}
          className="rounded-md bg-black/[0.06] px-3 py-1 text-xs font-medium text-black/60 hover:text-black/80"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
