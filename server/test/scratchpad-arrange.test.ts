import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'path'

import { createTLStore, defaultBindingUtils, defaultShapeUtils, loadSnapshot } from 'tldraw'

import type { ScratchOp } from '@/lib/types'

import { executeScratchOp } from '../scratchpad-executor'
import { loadScratchpadDoc, readScratchpadShapes } from '../scratchpad'
import { fitRectToLabel } from '../scratchpad-metrics'

// The arrangement layer: relative placement on add, auto-sized rects, and the
// align / distribute / autosize / tidy verbs. Same contract as the executor
// tests — every op must leave a snapshot the browser could load.

let WS: string
beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'scratch-arrange-test-'))
})
afterEach(() => {
  rmSync(WS, { recursive: true, force: true })
})

const run = (op: ScratchOp) => executeScratchOp(WS, 'ws-test', op)

// Loads the persisted snapshot into a fresh store the way the browser does. Throws
// (failing the test) if any record is invalid, then returns the shape count.
async function assertLoadable(): Promise<number> {
  const { document } = await loadScratchpadDoc(WS)
  const store = createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils })
  loadSnapshot(store, { document } as unknown as Parameters<typeof loadSnapshot>[1])
  return store.allRecords().filter(r => r.typeName === 'shape').length
}

async function shapeById(id: string) {
  const shape = (await readScratchpadShapes(WS)).find(s => s.id === id)
  if (!shape) throw new Error(`Shape "${id}" not found`)
  return shape
}

const rect = (name: string, x: number, y: number, w: number, h: number): ScratchOp => ({
  kind: 'add-rect',
  name,
  x,
  y,
  w,
  h
})

describe('relative placement (place on add)', () => {
  // Anchor: a 200×100 rect at (100,100); every placed shape is 100×50.
  const place = (side: 'above' | 'below' | 'left' | 'right', gap: number, align = 'center') =>
    ({
      kind: 'add-rect',
      name: `p-${side}-${align}`,
      place: { anchor: 'a', side, gap, align },
      w: 100,
      h: 50
    }) as ScratchOp

  test('--below with gap and center align computes x/y from the anchor bounds', async () => {
    await run(rect('a', 100, 100, 200, 100))
    await run(place('below', 48))
    // y: anchor bottom (200) + gap; x: centers match (100 + (200-100)/2).
    expect(await shapeById('p-below-center')).toMatchObject({ x: 150, y: 248 })
    expect(await assertLoadable()).toBe(2)
  })

  test('all four sides place on the right axis', async () => {
    await run(rect('a', 100, 100, 200, 100))
    await run(place('above', 20))
    await run(place('left', 30))
    await run(place('right', 30))
    expect(await shapeById('p-above-center')).toMatchObject({ x: 150, y: 30 })
    expect(await shapeById('p-left-center')).toMatchObject({ x: -30, y: 125 })
    expect(await shapeById('p-right-center')).toMatchObject({ x: 330, y: 125 })
    expect(await assertLoadable()).toBe(4)
  })

  test('cross-axis align: start = leading edges flush, end = trailing edges flush', async () => {
    await run(rect('a', 100, 100, 200, 100))
    await run(place('below', 48, 'start'))
    await run(place('below', 48, 'end'))
    expect(await shapeById('p-below-start')).toMatchObject({ x: 100, y: 248 })
    expect(await shapeById('p-below-end')).toMatchObject({ x: 200, y: 248 })
  })

  test('unknown or arrow anchors error clearly', async () => {
    await run(rect('a', 0, 0, 10, 10))
    await run(rect('b', 100, 0, 10, 10))
    await run({ kind: 'add-arrow', name: 'arr', from: { name: 'a' }, to: { name: 'b' } })
    await expect(
      run({
        kind: 'add-rect',
        name: 'x',
        place: { anchor: 'ghost', side: 'below', gap: 48, align: 'center' }
      })
    ).rejects.toThrow(/ghost/)
    await expect(
      run({
        kind: 'add-rect',
        name: 'x',
        place: { anchor: 'arr', side: 'below', gap: 48, align: 'center' }
      })
    ).rejects.toThrow(/arrow/)
  })

  test('an add without --at or a placement errors clearly', async () => {
    await expect(run({ kind: 'add-note', name: 'n', text: 'hi' })).rejects.toThrow(/--at/)
  })
})

describe('auto-sized rects', () => {
  test('a labeled rect without --size fits its label exactly', async () => {
    const text = 'reverse proxy on localhost:3000 with TLS termination'
    await run({ kind: 'add-rect', name: 'box', x: 0, y: 0, text })
    const fit = fitRectToLabel(text, { size: 'm', targetWidth: 260 })
    expect(await shapeById('box')).toMatchObject({ w: fit.w, h: fit.h })
    expect(await assertLoadable()).toBe(1)
  })

  test('the label font size feeds the fit', async () => {
    const text = 'Big headline box'
    await run({ kind: 'add-rect', name: 'big', x: 0, y: 0, text, size: 'xl' })
    const fit = fitRectToLabel(text, { size: 'xl', targetWidth: 260 })
    expect(await shapeById('big')).toMatchObject({ w: fit.w, h: fit.h })
  })

  test('an unlabeled rect without --size gets the default node box', async () => {
    await run({ kind: 'add-rect', name: 'plain', x: 0, y: 0 })
    expect(await shapeById('plain')).toMatchObject({ w: 160, h: 96 })
  })
})

describe('align', () => {
  test('--edge left makes left edges equal, moving x only', async () => {
    await run(rect('a', 100, 0, 50, 50))
    await run(rect('b', 137, 100, 80, 40))
    await run(rect('c', 90, 200, 60, 60))
    await run({ kind: 'align', names: ['a', 'b', 'c'], edge: 'left' })
    expect(await shapeById('b')).toMatchObject({ x: 100, y: 100 })
    expect(await shapeById('c')).toMatchObject({ x: 100, y: 200 })
    expect(await assertLoadable()).toBe(3)
  })

  test('center-x aligns centers, honoring --to', async () => {
    await run(rect('a', 0, 0, 100, 50)) // center 50
    await run(rect('b', 200, 100, 40, 40)) // center 220
    await run({ kind: 'align', names: ['a', 'b'], edge: 'center-x', to: 'b' })
    // a's center moves to 220 → x = 220 - 50; the anchor stays put.
    expect(await shapeById('a')).toMatchObject({ x: 170, y: 0 })
    expect(await shapeById('b')).toMatchObject({ x: 200, y: 100 })
  })

  test('unknown ids error clearly', async () => {
    await run(rect('a', 0, 0, 10, 10))
    await expect(run({ kind: 'align', names: ['a', 'ghost'], edge: 'left' })).rejects.toThrow(
      /ghost/
    )
  })
})

describe('distribute', () => {
  test('--axis x --gap 48 repacks at exact gaps, first shape fixed', async () => {
    await run(rect('a', 0, 0, 100, 50))
    await run(rect('b', 300, 10, 80, 50))
    await run(rect('c', 500, 20, 60, 50))
    await run({ kind: 'distribute', names: ['a', 'b', 'c'], axis: 'x', gap: 48 })
    expect(await shapeById('a')).toMatchObject({ x: 0, y: 0 })
    expect(await shapeById('b')).toMatchObject({ x: 148, y: 10 })
    expect(await shapeById('c')).toMatchObject({ x: 276, y: 20 })
    expect(await assertLoadable()).toBe(3)
  })

  test('gapless mode equalizes spacing with the endpoints fixed', async () => {
    await run(rect('a', 0, 0, 100, 50))
    await run(rect('b', 190, 0, 100, 50))
    await run(rect('c', 500, 0, 100, 50))
    await run({ kind: 'distribute', names: ['a', 'b', 'c'], axis: 'x' })
    // Free space between a's right edge (100) and c's left edge (500) minus
    // b's width = 300 → two gaps of 150 → b sits at 250.
    expect(await shapeById('a')).toMatchObject({ x: 0 })
    expect(await shapeById('b')).toMatchObject({ x: 250 })
    expect(await shapeById('c')).toMatchObject({ x: 500 })
  })

  test('gapless mode needs at least 3 shapes', async () => {
    await run(rect('a', 0, 0, 10, 10))
    await run(rect('b', 100, 0, 10, 10))
    await expect(run({ kind: 'distribute', names: ['a', 'b'], axis: 'x' })).rejects.toThrow(
      /at least 3/
    )
  })
})

describe('autosize', () => {
  test('grows an overflowing rect to fit its label, keeping the top-left', async () => {
    const text = 'a label far too long for a hundred-pixel box to hold'
    await run({ kind: 'add-rect', name: 'tight', x: 40, y: 60, w: 100, h: 40, text })
    await run({ kind: 'autosize', names: ['tight'] })
    const fit = fitRectToLabel(text, { size: 'm', targetWidth: 260 })
    const shape = await shapeById('tight')
    expect(shape).toMatchObject({ x: 40, y: 60, w: fit.w, h: fit.h })
    expect(fit.w).toBeGreaterThan(100)
    expect(fit.h).toBeGreaterThan(40)
    expect(await assertLoadable()).toBe(1)
  })

  test('non-rect and unlabeled ids fail with per-id errors', async () => {
    await run({ kind: 'add-note', name: 'memo', x: 0, y: 0, text: 'hi' })
    await run(rect('bare', 100, 0, 50, 50))
    await expect(run({ kind: 'autosize', names: ['memo'] })).rejects.toThrow(/memo/)
    await expect(run({ kind: 'autosize', names: ['bare'] })).rejects.toThrow(/no label/)
  })
})

describe('tidy', () => {
  test('snaps positions to the grid (13,7 → 16,8 at grid 8)', async () => {
    await run(rect('a', 13, 7, 96, 48))
    await run({ kind: 'tidy' })
    expect(await shapeById('a')).toMatchObject({ x: 16, y: 8, w: 96, h: 48 })
    expect(await assertLoadable()).toBe(1)
  })

  test('pulls a 6px-off left edge onto its neighbor line; bound arrows still load', async () => {
    await run(rect('a', 96, 0, 96, 48))
    await run(rect('b', 102, 200, 96, 48))
    await run({ kind: 'add-arrow', name: 'arr', from: { name: 'a' }, to: { name: 'b' } })
    await run({ kind: 'tidy' })
    const a = await shapeById('a')
    const b = await shapeById('b')
    expect(a.x).toBe(b.x)
    // The arrow record wasn't touched, and the snapshot still loads cleanly.
    expect(await assertLoadable()).toBe(3)
  })

  test('a custom --grid drives the snap step', async () => {
    await run(rect('a', 30, 30, 96, 48))
    await run({ kind: 'tidy', grid: 20 })
    expect(await shapeById('a')).toMatchObject({ x: 40, y: 40 })
  })
})
