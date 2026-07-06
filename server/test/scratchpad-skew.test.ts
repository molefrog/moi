import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'path'

import type { ScratchpadWriter } from '@/lib/types'

import { executeScratchOp } from '../scratchpad-executor'
import {
  SCRATCHPAD_WRITER,
  getScratchpadPath,
  loadScratchpadDoc,
  readScratchpadShapes
} from '../scratchpad'

// Version-skew behavior: `.moi/.scratchpad.json` embeds the writer's tldraw
// schema and tldraw has no down-migrations, so a snapshot written by a newer
// tldraw must fail HERE with an actionable message (not tldraw's bare
// `migration-error`), while the raw-JSON read path keeps working. See
// docs/moi-scratchpad.md § Version skew.

let WS: string
beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'scratch-skew-test-'))
})
afterEach(() => {
  rmSync(WS, { recursive: true, force: true })
})

const run = (op: Parameters<typeof executeScratchOp>[2]) => executeScratchOp(WS, 'ws-test', op)

type FileShape = {
  document: { schema: { sequences: Record<string, number> }; store: Record<string, unknown> }
  writer?: ScratchpadWriter
}

async function readFile(): Promise<FileShape> {
  return JSON.parse(await Bun.file(getScratchpadPath(WS)).text())
}

// A real current-schema snapshot with one sequence bumped past this runtime —
// exactly what a newer tldraw leaves behind.
async function writeSkewedFixture(writer?: ScratchpadWriter): Promise<string> {
  await run({ kind: 'add-note', name: 'n1', x: 0, y: 0, text: 'hello' })
  const file = await readFile()
  file.document.schema.sequences['com.tldraw.shape.note'] += 1
  if (writer) file.writer = writer
  else delete file.writer
  const text = JSON.stringify(file, null, 2)
  await Bun.write(getScratchpadPath(WS), text)
  return text
}

describe('scratchpad version skew', () => {
  test('saves are stamped with the writing moi + tldraw, and load surfaces it', async () => {
    await run({ kind: 'add-rect', name: 'box', x: 0, y: 0, w: 10, h: 10 })
    expect((await readFile()).writer).toEqual(SCRATCHPAD_WRITER)
    expect(SCRATCHPAD_WRITER.tldraw).toMatch(/^\d+\.\d+\.\d+/)
    expect((await loadScratchpadDoc(WS)).writer).toEqual(SCRATCHPAD_WRITER)
  })

  test('an unstamped legacy file still loads (writer just absent)', async () => {
    await run({ kind: 'add-rect', name: 'box', x: 0, y: 0, w: 10, h: 10 })
    const file = await readFile()
    delete file.writer
    await Bun.write(getScratchpadPath(WS), JSON.stringify(file))
    expect((await loadScratchpadDoc(WS)).writer).toBeUndefined()
    await run({ kind: 'add-rect', name: 'box2', x: 20, y: 0, w: 10, h: 10 })
    expect(await readScratchpadShapes(WS)).toHaveLength(2)
  })

  test('a newer-schema snapshot fails with the actionable message, naming the stamp', async () => {
    const before = await writeSkewedFixture({ moi: '9.9.9', tldraw: '99.0.0' })

    const err = await run({ kind: 'add-rect', name: 'box', x: 0, y: 0, w: 10, h: 10 }).then(
      () => null,
      (e: Error) => e
    )
    expect(err?.message).toContain('written by a newer moi')
    expect(err?.message).toContain('moi 9.9.9, tldraw 99.0.0')
    expect(err?.message).toContain(`this server has tldraw ${SCRATCHPAD_WRITER.tldraw}`)
    expect(err?.message).toContain('bun install -g moi-computer@latest')
    expect(err?.message).toContain('intact')
    expect(err?.message).not.toContain('migration-error')

    // The failed op must not have touched the file.
    expect(await Bun.file(getScratchpadPath(WS)).text()).toBe(before)
  })

  test('an unstamped newer-schema snapshot names the sequences that are ahead', async () => {
    await writeSkewedFixture()
    const err = await run({ kind: 'clear' }).then(
      () => null,
      (e: Error) => e
    )
    expect(err?.message).toContain('written by a newer moi')
    expect(err?.message).toContain('com.tldraw.shape.note')
  })

  test('moi scratch read still works under skew (raw JSON, no migration)', async () => {
    await writeSkewedFixture({ moi: '9.9.9', tldraw: '99.0.0' })
    const shapes = await readScratchpadShapes(WS)
    expect(shapes).toEqual([expect.objectContaining({ id: 'n1', type: 'note', text: 'hello' })])
  })

  test('a corrupt (non-skew) snapshot fails differently, keeping the cause', async () => {
    await run({ kind: 'add-rect', name: 'box', x: 0, y: 0, w: 10, h: 10 })
    const file = await readFile()
    // Same schema, mangled record — genuine corruption, not version skew.
    file.document.store['shape:box'] = { typeName: 'shape', id: 'shape:box', type: 'geo' }
    await Bun.write(getScratchpadPath(WS), JSON.stringify(file))
    const err = await run({ kind: 'clear' }).then(
      () => null,
      (e: Error) => e
    )
    expect(err?.message).toContain('not a version mismatch')
    expect(err?.message).not.toContain('written by a newer moi')
  })

  test('the first save after a schema change backs up the old file as .bak', async () => {
    await run({ kind: 'add-rect', name: 'box', x: 0, y: 0, w: 10, h: 10 })
    const path = getScratchpadPath(WS)

    // Same-schema saves: no backup. (Fresh Bun.file handles each time — a
    // handle that has observed a missing file keeps reporting it empty.)
    await run({ kind: 'add-rect', name: 'box2', x: 20, y: 0, w: 10, h: 10 })
    expect(await Bun.file(`${path}.bak`).exists()).toBe(false)

    // Simulate the on-disk file predating a schema bump, then save over it.
    const file = await readFile()
    const oldText = JSON.stringify({
      ...file,
      document: {
        ...file.document,
        schema: {
          ...file.document.schema,
          sequences: { ...file.document.schema.sequences, 'com.tldraw.shape.note': 0 }
        }
      }
    })
    await Bun.write(path, oldText)
    await run({ kind: 'add-rect', name: 'box3', x: 40, y: 0, w: 10, h: 10 })
    expect(await Bun.file(`${path}.bak`).text()).toBe(oldText)
  })
})
