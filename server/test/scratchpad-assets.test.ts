import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { readdir, utimes } from 'node:fs/promises'
import { join } from 'path'

import { loadScratchpadDoc, readScratchpadImage, saveScratchpadDoc } from '../scratchpad'
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

describe('sweepOrphanAssets', () => {
  test('deletes old unreferenced files, keeps referenced and recent ones', async () => {
    const { src } = await storeScratchpadAsset(WS, PNG_BYTES, 'image/png')
    const referenced = assetSrcFileName(src)!
    const { src: orphanSrc } = await storeScratchpadAsset(
      WS,
      new Uint8Array([1, 2, 3]),
      'image/png'
    )
    const oldOrphan = assetSrcFileName(orphanSrc)!
    const { src: freshSrc } = await storeScratchpadAsset(WS, new Uint8Array([4, 5, 6]), 'image/png')
    const freshOrphan = assetSrcFileName(freshSrc)!

    // Age everything past the grace window, then re-touch the fresh orphan.
    const dir = getScratchpadAssetsDir(WS)
    const past = new Date(Date.now() - 60 * 60_000)
    for (const name of [referenced, oldOrphan]) await utimes(join(dir, name), past, past)

    const doc: ScratchpadDoc = {
      store: {
        'asset:a1': { id: 'asset:a1', typeName: 'asset', type: 'image', props: { src } }
      }
    }
    await sweepOrphanAssets(WS, doc)

    const left = await readdir(dir)
    expect(left).toContain(referenced)
    expect(left).toContain(freshOrphan)
    expect(left).not.toContain(oldOrphan)
  })

  test('is a no-op when the assets dir does not exist', async () => {
    await sweepOrphanAssets(WS, { store: {} })
  })
})
