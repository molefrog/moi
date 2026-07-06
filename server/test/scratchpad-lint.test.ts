import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'path'

import { createTLStore, defaultBindingUtils, defaultShapeUtils, loadSnapshot } from 'tldraw'

import type { ScratchOp } from '@/lib/types'

import { executeScratchOp } from '../scratchpad-executor'
import { loadScratchpadDoc } from '../scratchpad'
import { lintScratchpad } from '../scratchpad-lint'
import { LABEL_PADDING, fitRectToLabel } from '../scratchpad-metrics'

// Lint reads geometry off the disk snapshot and measures text with the real
// canvas font — findings must be facts (with runnable fixes), and a clean
// canvas must stay silent.

let WS: string
beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'scratch-lint-test-'))
})
afterEach(() => {
  rmSync(WS, { recursive: true, force: true })
})

const run = (op: ScratchOp) => executeScratchOp(WS, 'ws-test', op)
const lint = () => lintScratchpad(WS)

// Loads the persisted snapshot into a fresh store the way the browser does —
// mutations (resize) must never corrupt the document.
async function assertLoadable(): Promise<number> {
  const { document } = await loadScratchpadDoc(WS)
  const store = createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils })
  loadSnapshot(store, { document } as unknown as Parameters<typeof loadSnapshot>[1])
  return store.allRecords().filter(r => r.typeName === 'shape').length
}

describe('lintScratchpad', () => {
  test('flags an overflowing label with the fitRectToLabel resize as the fix', async () => {
    const text = 'reverse proxy at localhost:3000 with TLS termination'
    await run({ kind: 'add-rect', name: 'proxy', x: 0, y: 0, w: 140, h: 60, text })

    const findings = await lint()
    const overflow = findings.find(f => f.code === 'text-overflow')
    expect(overflow).toBeDefined()
    expect(overflow!.severity).toBe('error')
    expect(overflow!.ids).toEqual(['proxy'])

    // The fix is exactly what fitRectToLabel computes for this rect (default
    // 'm' label size; wrap target never narrower than 240 or the current rect).
    const fit = fitRectToLabel(text, {
      size: 'm',
      targetWidth: Math.max(140 - 2 * LABEL_PADDING, 240),
      minW: 140
    })
    expect(overflow!.fix).toBe(`moi scratch resize proxy --size ${fit.w},${fit.h}`)
  })

  test('resize applies the fix and clears the overflow finding', async () => {
    const text = 'reverse proxy at localhost:3000 with TLS termination'
    await run({ kind: 'add-rect', name: 'proxy', x: 0, y: 0, w: 140, h: 60, text })
    const before = await lint()
    const overflow = before.find(f => f.code === 'text-overflow')
    expect(overflow).toBeDefined()

    const [, w, h] = overflow!.fix!.match(/--size (\d+),(\d+)/)!
    await run({ kind: 'resize', name: 'proxy', w: Number(w), h: Number(h) })
    expect(await assertLoadable()).toBe(1)

    const after = await lint()
    expect(after.find(f => f.code === 'text-overflow')).toBeUndefined()
  })

  test('resize rejects shapes that size themselves', async () => {
    await run({ kind: 'add-note', name: 'sticky', x: 0, y: 0, text: 'hi' })
    await expect(run({ kind: 'resize', name: 'sticky', w: 100, h: 100 })).rejects.toThrow(
      /Only rectangles and images/
    )
  })

  test('flags partial overlap with a concrete separating move', async () => {
    await run({ kind: 'add-rect', name: 'a', x: 0, y: 0, w: 100, h: 100 })
    await run({ kind: 'add-rect', name: 'b', x: 60, y: 10, w: 100, h: 100 })

    const findings = await lint()
    const overlap = findings.find(f => f.code === 'overlap')
    expect(overlap).toBeDefined()
    expect(overlap!.severity).toBe('error')
    expect(overlap!.ids!.sort()).toEqual(['a', 'b'])
    expect(overlap!.fix).toMatch(/^moi scratch move [ab] --to -?[\d.]+,-?[\d.]+$/)
    // Overlapping pairs are never also nagged about alignment.
    expect(findings.find(f => f.code === 'near-misalign')).toBeUndefined()
  })

  test('containment is grouping, not an overlap', async () => {
    await run({ kind: 'add-rect', name: 'container', x: 0, y: 0, w: 400, h: 300 })
    await run({ kind: 'add-rect', name: 'member', x: 40, y: 40, w: 120, h: 80, text: 'svc' })

    expect(await lint()).toEqual([])
  })

  test('flags 4px-off top edges with the exact aligning move', async () => {
    await run({ kind: 'add-rect', name: 'a', x: 0, y: 0, w: 100, h: 50 })
    await run({ kind: 'add-rect', name: 'b', x: 204, y: 4, w: 100, h: 50 })

    const findings = await lint()
    const misalign = findings.find(f => f.code === 'near-misalign')
    expect(misalign).toBeDefined()
    expect(misalign!.severity).toBe('warn')
    expect(misalign!.message).toContain('top edges')
    expect(misalign!.message).toContain('4px')
    expect(misalign!.fix).toBe('moi scratch move b --to 204,0')
  })

  test('flags uneven gaps in a row, fixed with the median gap', async () => {
    await run({ kind: 'add-rect', name: 'r1', x: 0, y: 0, w: 100, h: 50 })
    await run({ kind: 'add-rect', name: 'r2', x: 140, y: 0, w: 100, h: 50 }) // gap 40
    await run({ kind: 'add-rect', name: 'r3', x: 340, y: 0, w: 100, h: 50 }) // gap 100

    const findings = await lint()
    const gaps = findings.find(f => f.code === 'uneven-gaps')
    expect(gaps).toBeDefined()
    expect(gaps!.severity).toBe('warn')
    expect(gaps!.ids).toEqual(['r1', 'r2', 'r3'])
    expect(gaps!.fix).toContain('moi scratch move')
  })

  test('a clean, aligned canvas yields zero findings', async () => {
    // A tidy row: same y, equal sizes, equal 80px gaps, labels that fit.
    await run({ kind: 'add-rect', name: 'a', x: 0, y: 0, w: 160, h: 80, text: 'A' })
    await run({ kind: 'add-rect', name: 'b', x: 240, y: 0, w: 160, h: 80, text: 'B' })
    await run({ kind: 'add-rect', name: 'c', x: 480, y: 0, w: 160, h: 80, text: 'C' })
    await run({ kind: 'add-arrow', name: 'ab', from: { name: 'a' }, to: { name: 'b' } })
    await run({ kind: 'add-text', name: 'title', x: 0, y: -80, text: 'clean row' })

    expect(await lint()).toEqual([])
  })
})
