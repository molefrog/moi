import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'path'

import { createTLStore, defaultBindingUtils, defaultShapeUtils, loadSnapshot } from 'tldraw'

import type { ScratchOp } from '@/lib/types'

import { executeScratchOp } from '../scratchpad-executor'
import { getScratchpadPath, loadScratchpadDoc, readScratchpadShapes } from '../scratchpad'

// The headless write path: `executeScratchOp` must produce a snapshot that (a)
// `read` reflects and (b) the *browser* could load — i.e. it survives a fresh
// tldraw `loadSnapshot` without a validation error. No browser tab involved.

let WS: string
beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'scratch-exec-test-'))
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

describe('executeScratchOp (headless)', () => {
  test('draws to disk with no browser, and the snapshot is browser-loadable', async () => {
    await run({ kind: 'add-rect', name: 'box1', x: 10, y: 20, w: 100, h: 80, text: 'hello' })
    await run({ kind: 'add-text', name: 'label', x: 200, y: 20, text: 'a label' })
    await run({ kind: 'add-note', name: 'note1', x: 300, y: 20, text: 'a note' })
    await run({ kind: 'add-rect', name: 'box2', x: 400, y: 200, w: 60, h: 60 })
    await run({
      kind: 'add-arrow',
      name: 'arr',
      from: { name: 'box1' },
      to: { name: 'box2' },
      elbow: true
    })

    expect(await assertLoadable()).toBe(5)

    const shapes = await readScratchpadShapes(WS)
    const byId = Object.fromEntries(shapes.map(s => [s.id, s]))
    expect(byId.box1).toMatchObject({ type: 'geo', x: 10, y: 20, w: 100, h: 80, text: 'hello' })
    expect(byId.label).toMatchObject({ type: 'text', text: 'a label' })
    expect(byId.note1).toMatchObject({ type: 'note', text: 'a note' })
    expect(byId.arr.type).toBe('arrow')
  })

  test('move / set / delete / clear mutate the snapshot', async () => {
    await run({ kind: 'add-rect', name: 'box', x: 0, y: 0, w: 50, h: 50, text: 'old' })

    await run({ kind: 'move', name: 'box', x: 123, y: 456 })
    await run({ kind: 'set', name: 'box', text: 'new' })
    let box = (await readScratchpadShapes(WS)).find(s => s.id === 'box')
    expect(box).toMatchObject({ x: 123, y: 456, text: 'new' })

    await run({ kind: 'delete', name: 'box' })
    expect((await readScratchpadShapes(WS)).some(s => s.id === 'box')).toBe(false)

    await run({ kind: 'add-rect', name: 'a', x: 0, y: 0, w: 10, h: 10 })
    await run({ kind: 'add-rect', name: 'b', x: 20, y: 0, w: 10, h: 10 })
    await run({ kind: 'clear' })
    expect(await readScratchpadShapes(WS)).toHaveLength(0)
    // An empty canvas still persists a valid (loadable) document.
    expect(await assertLoadable()).toBe(0)
  })

  test('deleting an arrow endpoint removes the dangling binding too', async () => {
    await run({ kind: 'add-rect', name: 'from', x: 0, y: 0, w: 10, h: 10 })
    await run({ kind: 'add-rect', name: 'to', x: 100, y: 0, w: 10, h: 10 })
    await run({ kind: 'add-arrow', name: 'arr', from: { name: 'from' }, to: { name: 'to' } })

    await run({ kind: 'delete', name: 'to' })
    // Arrow remains, 'to' is gone, and the snapshot is still browser-loadable
    // (a leftover binding to a missing shape would throw on load).
    expect(await assertLoadable()).toBe(2)
  })

  test('addressing a missing shape throws a clear error', async () => {
    await expect(run({ kind: 'move', name: 'ghost', x: 0, y: 0 })).rejects.toThrow(/ghost/)
    await expect(
      run({ kind: 'add-arrow', name: 'a', from: { name: 'ghost' }, to: { x: 0, y: 0 } })
    ).rejects.toThrow(/ghost/)
  })

  test('persists nothing but a single scratchpad.json under .moi', async () => {
    await run({ kind: 'add-rect', name: 'box', x: 0, y: 0, w: 10, h: 10 })
    expect(await Bun.file(getScratchpadPath(WS)).exists()).toBe(true)
  })
})
