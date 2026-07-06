import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'path'
import sharp from 'sharp'

import type { ScratchOp } from '@/lib/types'

import { executeScratchOp } from '../scratchpad-executor'
import { getScratchpadPath } from '../scratchpad'
import { renderScratchpadPng } from '../scratchpad-render'

// The server-side view: canvases drawn through the headless executor must
// rasterize to a real PNG with no browser — approximate fidelity, exact layout.

let WS: string
beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'scratch-render-test-'))
})
afterEach(() => {
  rmSync(WS, { recursive: true, force: true })
})

const run = (op: ScratchOp) => executeScratchOp(WS, 'ws-test', op)

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

function pngSize(png: Uint8Array): { w: number; h: number } {
  // Width and height are big-endian u32s at offsets 16/20 of the IHDR chunk.
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return { w: view.getUint32(16), h: view.getUint32(20) }
}

describe('renderScratchpadPng', () => {
  test('renders the primitive shape set to a plausible PNG', async () => {
    await run({ kind: 'add-rect', name: 'box1', x: 0, y: 0, w: 160, h: 80, text: 'hello' })
    await run({ kind: 'add-rect', name: 'box2', x: 400, y: 200, w: 120, h: 80, text: 'world' })
    await run({ kind: 'add-note', name: 'note1', x: 240, y: 0, text: 'a note' })
    await run({ kind: 'add-text', name: 'label', x: 0, y: 240, text: 'free text' })
    await run({
      kind: 'add-arrow',
      name: 'bound',
      from: { name: 'box1' },
      to: { name: 'box2' },
      elbow: true
    })
    await run({ kind: 'add-arrow', name: 'free', from: { x: 0, y: 400 }, to: { x: 200, y: 440 } })

    const png = await renderScratchpadPng(WS)
    expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC)

    // Content spans x 0..520, y 0..440; plus 48px padding each side. The exact
    // extent depends on measured text, so assert a sane envelope, not pixels.
    const { w, h } = pngSize(png)
    expect(w).toBeGreaterThan(520)
    expect(w).toBeLessThan(1200)
    expect(h).toBeGreaterThan(440)
    expect(h).toBeLessThan(1000)
  })

  test('caps the long side at 2048px for a sprawling canvas', async () => {
    await run({ kind: 'add-rect', name: 'a', x: 0, y: 0, w: 100, h: 100 })
    await run({ kind: 'add-rect', name: 'b', x: 6000, y: 0, w: 100, h: 100 })
    const { w, h } = pngSize(await renderScratchpadPng(WS))
    expect(w).toBe(2048)
    expect(h).toBeLessThan(2048)
  })

  test('renders a webp image shape (transcoded for resvg)', async () => {
    const file = join(WS, 'tiny.webp')
    await sharp({
      create: { width: 60, height: 40, channels: 3, background: { r: 200, g: 40, b: 90 } }
    })
      .webp()
      .toFile(file)
    await run({ kind: 'add-image', name: 'pic', x: 0, y: 0, path: file })

    const png = await renderScratchpadPng(WS)
    expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC)
  })

  test('an unsupported shape type renders as a placeholder, not a throw', async () => {
    await run({ kind: 'add-rect', name: 'box', x: 0, y: 0, w: 100, h: 100 })
    // Splice a shape kind the renderer doesn't know into the snapshot — the
    // browser can create types (frame, embed, …) the executor never makes.
    const path = getScratchpadPath(WS)
    const snapshot = await Bun.file(path).json()
    snapshot.document.store['shape:weird'] = {
      typeName: 'shape',
      id: 'shape:weird',
      type: 'frame',
      x: 200,
      y: 0,
      rotation: 0,
      index: 'a9',
      parentId: snapshot.document.store['shape:box'].parentId,
      isLocked: false,
      opacity: 1,
      meta: {},
      props: { w: 150, h: 90 }
    }
    await Bun.write(path, JSON.stringify(snapshot))

    const png = await renderScratchpadPng(WS)
    expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC)
  })

  test('an empty canvas is a clear error, not a blank image', async () => {
    await expect(renderScratchpadPng(WS)).rejects.toThrow('Canvas is empty')
  })
})
