import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'path'

import {
  loadScratchpadDoc,
  readScratchpadImage,
  readScratchpadShapes,
  saveScratchpadDoc,
  sweepAllWorkspaces
} from '../scratchpad'
import type { ScratchpadDoc } from '../scratchpad'
import {
  assetSrcFileName,
  extractInlineAssets,
  getScratchpadAssetsDir,
  scratchpadAssetFile,
  storeScratchpadAsset,
  sweepOrphanAssets
} from '../scratchpad-assets'

// The file-backed asset store keeps image bytes OUT of `.moi/.scratchpad.json`:
// content-addressed files under `.moi/.scratchpad/`, `asset:` srcs on the
// records, lazy migration of legacy inline base64 on save, and an orphan sweep.

let WS: string
beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'scratch-assets-test-'))
})
afterEach(() => {
  rmSync(WS, { recursive: true, force: true })
})

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
const PNG_B64 = Buffer.from(PNG_BYTES).toString('base64')

// A minimal snapshot the way tldraw persists it: one image shape whose asset
// record inlines the bytes as a base64 data URL (the legacy on-disk shape).
function legacyDoc(): ScratchpadDoc {
  return {
    store: {
      'asset:a1': {
        id: 'asset:a1',
        typeName: 'asset',
        type: 'image',
        props: { name: 'x.png', src: `data:image/png;base64,${PNG_B64}`, w: 4, h: 4 }
      },
      'shape:pic': {
        id: 'shape:pic',
        typeName: 'shape',
        type: 'image',
        x: 0,
        y: 0,
        props: { assetId: 'asset:a1', w: 4, h: 4 }
      }
    }
  }
}

describe('storeScratchpadAsset', () => {
  test('content-addresses the file and dedupes identical bytes', async () => {
    const a = await storeScratchpadAsset(WS, PNG_BYTES, 'image/png')
    const b = await storeScratchpadAsset(WS, PNG_BYTES, 'image/png')
    expect(a.src).toBe(b.src)
    expect(a.src).toMatch(/^asset:asset-[0-9a-f]{64}\.png$/)
    expect(await readdir(getScratchpadAssetsDir(WS))).toHaveLength(1)
  })

  test('unknown mime types fall back to a .bin file served as octet-stream', async () => {
    const { src } = await storeScratchpadAsset(WS, PNG_BYTES, 'application/x-weird')
    expect(src).toEndWith('.bin')
    const resolved = scratchpadAssetFile(WS, assetSrcFileName(src) ?? '')
    expect(resolved?.mimeType).toBe('application/octet-stream')
  })
})

describe('assetSrcFileName / scratchpadAssetFile', () => {
  test('accepts only our own asset-<sha256>.ext names — no traversal, no other schemes', () => {
    const hash = 'a'.repeat(64)
    expect(assetSrcFileName(`asset:asset-${hash}.png`)).toBe(`asset-${hash}.png`)
    expect(assetSrcFileName('asset:../../etc/passwd')).toBeNull()
    expect(assetSrcFileName(`asset:asset-${hash}`)).toBeNull()
    expect(assetSrcFileName(`asset:${hash}.png`)).toBeNull()
    expect(assetSrcFileName('data:image/png;base64,AAAA')).toBeNull()
    expect(assetSrcFileName('https://example.com/x.png')).toBeNull()
    expect(scratchpadAssetFile(WS, '../secret')).toBeNull()
    expect(scratchpadAssetFile(WS, `${hash}.png`)).toBeNull()
    expect(scratchpadAssetFile(WS, `asset-${hash}.png`)).not.toBeNull()
  })
})

describe('extractInlineAssets', () => {
  test('rewrites inline base64 asset srcs to files; other srcs untouched', async () => {
    const doc = legacyDoc()
    const store = doc.store as Record<string, { props: { src?: string } }>
    store['asset:remote'] = {
      // @ts-expect-error minimal record for the walk
      id: 'asset:remote',
      typeName: 'asset',
      type: 'image',
      props: { src: 'https://example.com/pic.png' }
    }

    const out = await extractInlineAssets(doc, WS)
    const outStore = out.store as Record<string, { props: { src?: string } }>
    expect(outStore['asset:a1'].props.src).toMatch(/^asset:asset-[0-9a-f]{64}\.png$/)
    expect(outStore['asset:remote'].props.src).toBe('https://example.com/pic.png')
    // The original document is not mutated (snapshot records may be frozen).
    expect(store['asset:a1'].props.src).toStartWith('data:')

    const fileName = assetSrcFileName(outStore['asset:a1'].props.src ?? '')
    const resolved = scratchpadAssetFile(WS, fileName ?? '')
    expect(new Uint8Array(await resolved!.file.arrayBuffer())).toEqual(PNG_BYTES)
  })

  test('returns the same document when there is nothing to extract', async () => {
    const doc: ScratchpadDoc = { store: { 'shape:s': { typeName: 'shape', id: 'shape:s' } } }
    expect(await extractInlineAssets(doc, WS)).toBe(doc)
  })
})

describe('saveScratchpadDoc migration', () => {
  test('a legacy inline snapshot is extracted on save and read-image still works', async () => {
    await saveScratchpadDoc(legacyDoc(), WS)

    // On disk: no base64 left in the JSON, one sidecar file.
    const raw = await Bun.file(join(WS, '.moi', '.scratchpad.json')).text()
    expect(raw).not.toInclude(';base64,')
    expect(await readdir(getScratchpadAssetsDir(WS))).toHaveLength(1)

    const { document } = await loadScratchpadDoc(WS)
    const asset = (document?.store?.['asset:a1'] ?? {}) as { props?: { src?: string } }
    expect(asset.props?.src).toMatch(/^asset:asset-[0-9a-f]{64}\.png$/)

    // The agent's read-image path resolves the file back to a data URL.
    expect(await readScratchpadImage(WS, 'pic')).toEqual({
      src: `data:image/png;base64,${PNG_B64}`
    })
  })
})

describe('missing asset files (dangling references)', () => {
  test('read flags the shape, read-image errors clearly, intact shapes unflagged', async () => {
    await saveScratchpadDoc(legacyDoc(), WS)
    const dir = getScratchpadAssetsDir(WS)

    // Intact: no `missing` flag on the shape.
    let pic = (await readScratchpadShapes(WS)).find(s => s.id === 'pic')
    expect(pic?.src).toMatch(/^asset:asset-/)
    expect(pic?.missing).toBeUndefined()

    // Lose the sidecar file (e.g. snapshot copied without `.moi/.scratchpad/`).
    for (const name of await readdir(dir)) rmSync(join(dir, name))

    pic = (await readScratchpadShapes(WS)).find(s => s.id === 'pic')
    expect(pic?.missing).toBe(true)
    expect(await readScratchpadImage(WS, 'pic')).toEqual({
      error: expect.stringMatching(/missing/)
    })
  })
})

// An asset record plus a shape actually using it — the shape matters: the sweep
// treats an asset no shape uses as unreferenced (see the browser-deletion test).
function docWithImage(src: string): ScratchpadDoc {
  return {
    store: {
      'asset:a1': { id: 'asset:a1', typeName: 'asset', type: 'image', props: { src } },
      'shape:pic': {
        id: 'shape:pic',
        typeName: 'shape',
        type: 'image',
        x: 0,
        y: 0,
        props: { assetId: 'asset:a1', w: 4, h: 4 }
      }
    }
  }
}

describe('sweepOrphanAssets', () => {
  test('reclaims a file only after it has stayed unreferenced past the grace window', async () => {
    const { src } = await storeScratchpadAsset(WS, PNG_BYTES, 'image/png')
    const referenced = assetSrcFileName(src)!
    const { src: orphanSrc } = await storeScratchpadAsset(
      WS,
      new Uint8Array([1, 2, 3]),
      'image/png'
    )
    const orphan = assetSrcFileName(orphanSrc)!
    const dir = getScratchpadAssetsDir(WS)
    const doc = docWithImage(src)

    const t0 = 1_000_000
    // First sweep only starts the orphan's clock; nothing is deleted yet.
    await sweepOrphanAssets(WS, doc, undefined, t0)
    expect(await readdir(dir)).toContain(orphan)

    // Still within the grace window — kept.
    await sweepOrphanAssets(WS, doc, undefined, t0 + 60_000)
    expect(await readdir(dir)).toContain(orphan)

    // Past the window, the still-unreferenced orphan is reclaimed; the referenced
    // file was never on the clock and survives.
    await sweepOrphanAssets(WS, doc, undefined, t0 + 6 * 60_000)
    const left = await readdir(dir)
    expect(left).toContain(referenced)
    expect(left).not.toContain(orphan)
  })

  test('a long-referenced file gets a fresh grace window when it becomes unreferenced', async () => {
    const { src } = await storeScratchpadAsset(WS, PNG_BYTES, 'image/png')
    const name = assetSrcFileName(src)!
    const dir = getScratchpadAssetsDir(WS)
    const withImg = docWithImage(src)
    const empty: ScratchpadDoc = { store: {} }

    const t0 = 5_000_000
    // Referenced across sweeps spanning an hour.
    await sweepOrphanAssets(WS, withImg, undefined, t0)
    await sweepOrphanAssets(WS, withImg, undefined, t0 + 60 * 60_000)

    // It becomes unreferenced (e.g. `clear`). Despite the file being an hour old,
    // the next sweep must NOT delete it — the clock starts here, not at write time.
    // This is the sweep-race data-loss regression the grace anchoring fixes.
    await sweepOrphanAssets(WS, empty, undefined, t0 + 60 * 60_000)
    expect(await readdir(dir)).toContain(name)

    // Only after the grace elapses from the un-reference moment is it reclaimed.
    await sweepOrphanAssets(WS, empty, undefined, t0 + 60 * 60_000 + 6 * 60_000)
    expect(await readdir(dir)).not.toContain(name)
  })

  test('keeps files the .bak backup still references', async () => {
    const { src: bakSrc } = await storeScratchpadAsset(WS, new Uint8Array([7, 8, 9]), 'image/png')
    const bakKept = assetSrcFileName(bakSrc)!
    const { src: orphanSrc } = await storeScratchpadAsset(WS, new Uint8Array([1, 2]), 'image/png')
    const orphan = assetSrcFileName(orphanSrc)!

    // A .bak referencing only bakKept — the downgrade escape hatch.
    const bakFile = join(WS, '.moi', '.scratchpad.json.bak')
    await Bun.write(
      bakFile,
      JSON.stringify({
        document: {
          store: { 'asset:old': { typeName: 'asset', type: 'image', props: { src: bakSrc } } }
        }
      })
    )

    const dir = getScratchpadAssetsDir(WS)
    // Current document references neither file; run twice past the grace window.
    const t0 = 2_000_000
    await sweepOrphanAssets(WS, { store: {} }, bakFile, t0)
    await sweepOrphanAssets(WS, { store: {} }, bakFile, t0 + 6 * 60_000)

    const left = await readdir(dir)
    expect(left).toContain(bakKept) // pinned by the .bak, never on the clock
    expect(left).not.toContain(orphan)
  })

  test('is a no-op when the assets dir does not exist', async () => {
    await sweepOrphanAssets(WS, { store: {} })
  })

  test('an asset record no shape uses does not pin its file (browser image deletion)', async () => {
    // Deleting an image in the tldraw editor removes the SHAPE but leaves the
    // asset record in the document. Its file must still be reclaimable — this
    // was the original "orphaned assets are not deleted" repro.
    const { src } = await storeScratchpadAsset(WS, PNG_BYTES, 'image/png')
    const name = assetSrcFileName(src)!
    const doc = docWithImage(src)
    const afterDelete: ScratchpadDoc = {
      // Shape removed, asset record left behind — what the browser autosaves.
      store: { 'asset:a1': (doc.store as Record<string, unknown>)['asset:a1'] }
    }
    const dir = getScratchpadAssetsDir(WS)

    const t0 = 7_000_000
    // While the shape exists the file is referenced — never on the clock.
    await sweepOrphanAssets(WS, doc, undefined, t0)
    expect(await readdir(dir)).toContain(name)

    // Shape deleted in the browser: clock starts, grace applies (an undo that
    // restores the shape within the window would reset it)...
    await sweepOrphanAssets(WS, afterDelete, undefined, t0 + 1000)
    expect(await readdir(dir)).toContain(name)

    // ...and past the window the file is reclaimed despite the lingering record.
    await sweepOrphanAssets(WS, afterDelete, undefined, t0 + 7 * 60_000)
    expect(await readdir(dir)).not.toContain(name)
  })

  test('reclaims stale .tmp-* files left by a crashed write', async () => {
    await storeScratchpadAsset(WS, PNG_BYTES, 'image/png') // ensures the dir exists
    const dir = getScratchpadAssetsDir(WS)
    await Bun.write(join(dir, '.tmp-crashed'), 'partial bytes')
    const doc: ScratchpadDoc = { store: {} }

    // Too young to judge (could be a write in flight) — kept.
    await sweepOrphanAssets(WS, doc, undefined, Date.now())
    expect(await readdir(dir)).toContain('.tmp-crashed')

    // Older than the grace window — abandoned, reclaimed.
    await sweepOrphanAssets(WS, doc, undefined, Date.now() + 10 * 60_000)
    expect(await readdir(dir)).not.toContain('.tmp-crashed')
  })
})

describe('sweepAllWorkspaces', () => {
  test('the periodic pass reclaims expired orphans without any further save', async () => {
    const { setRegistryPath, registerWorkspace } = await import('../registry')
    setRegistryPath(join(WS, 'workspaces.json'))
    await registerWorkspace(WS, { type: 'claude-code' })

    const { src } = await storeScratchpadAsset(WS, PNG_BYTES, 'image/png')
    const kept = assetSrcFileName(src)!
    const { src: orphanSrc } = await storeScratchpadAsset(WS, new Uint8Array([4, 5]), 'image/png')
    const orphan = assetSrcFileName(orphanSrc)!
    // The pass judges against the snapshot on disk — write it directly.
    await Bun.write(
      join(WS, '.moi', '.scratchpad.json'),
      JSON.stringify({ document: docWithImage(src) })
    )

    // Start the orphan's clock far in the past so the pass (running at the real
    // Date.now()) sees the grace window already elapsed.
    await sweepOrphanAssets(WS, docWithImage(src), undefined, 1_000_000)

    await sweepAllWorkspaces()

    const left = await readdir(getScratchpadAssetsDir(WS))
    expect(left).toContain(kept)
    expect(left).not.toContain(orphan)
  })
})
