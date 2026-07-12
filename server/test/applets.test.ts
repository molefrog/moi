import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'path'

import {
  apiBaseFor,
  buildApplets,
  getAppletPaths,
  parseAppletTail,
  serveApplet,
  serveWorkspaceFile
} from '../applets'

// These cover the kind-agnostic applet HTTP machinery without invoking
// Bun.build: serving files from a compiled bundle dir (sentinel swap + asset
// streaming), the route-tail parser, and the `fileUrl` workspace-file route
// (whose guards are security-critical). The compile path lives in
// build-applet.test.ts.

let WS: string
beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'moi-atest-'))
})
afterEach(() => {
  rmSync(WS, { recursive: true, force: true })
})

function seedApplet(
  kind: 'widgets' | 'views',
  name: string,
  files: Record<string, string | Uint8Array>
) {
  const dir = join(WS, '.moi', '.build', kind, name)
  mkdirSync(dir, { recursive: true })
  for (const [f, data] of Object.entries(files)) writeFileSync(join(dir, f), data)
}

describe('serveApplet', () => {
  const BASE = '/api/workspaces/ws123'

  test('swaps the API base sentinel in served .js', async () => {
    seedApplet('views', 'editor', {
      'index.js': 'const B="%%MOI_APPLET_API_BASE%%";export default B'
    })
    const res = await serveApplet('view', 'editor', 'index.js', WS, BASE)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    const body = await res.text()
    expect(body).toContain(BASE)
    expect(body).not.toContain('%%MOI_APPLET_API_BASE%%')
  })

  test('streams an asset untouched with an inferred content-type', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
    seedApplet('views', 'editor', { 'index.js': '//', 'logo-abc123.png': png })
    const res = await serveApplet('view', 'editor', 'logo-abc123.png', WS, BASE)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(png)
  })

  test('serves a code chunk with the JS content-type', async () => {
    seedApplet('widgets', 'clock', { 'index.js': '//', 'chunk-9f.js': 'export const x=1' })
    const res = await serveApplet('widget', 'clock', 'chunk-9f.js', WS, BASE)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
  })

  test('serves an asset whose name starts with _ (underscore-stem)', async () => {
    // Asset stems derive from the source basename, so a `_icon.png` import (or a
    // view named `__x`) produces `__x-<hash>.png` — a leading underscore must
    // not be rejected by the filename guard.
    seedApplet('views', '__x', { 'index.js': '//', '__x-4386fc.png': new Uint8Array([1]) })
    const res = await serveApplet('view', '__x', '__x-4386fc.png', WS, BASE)
    expect(res.status).toBe(200)
  })

  test('entry index.js revalidates: ETag + no-cache, 304 on match', async () => {
    // The entry's url is stable across rebuilds, so an edge cache must revalidate
    // it or it serves a stale bundle. It carries an ETag + `no-cache`; a request
    // echoing that ETag gets a bodyless 304.
    seedApplet('views', 'editor', { 'index.js': 'export default 1' })
    const res = await serveApplet('view', 'editor', 'index.js', WS, BASE)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-cache')
    const etag = res.headers.get('etag')
    expect(etag).toBeTruthy()

    const revalidated = await serveApplet('view', 'editor', 'index.js', WS, BASE, etag)
    expect(revalidated.status).toBe(304)
    expect(revalidated.headers.get('etag')).toBe(etag)
    expect(await revalidated.text()).toBe('')
  })

  test('a stale ETag on the entry still serves fresh bytes (200)', async () => {
    seedApplet('views', 'editor', { 'index.js': 'export default 1' })
    const res = await serveApplet('view', 'editor', 'index.js', WS, BASE, '"stale"')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('export default 1')
  })

  test('hashed chunks and assets are immutable — never revalidated', async () => {
    // A content-hashed url is a fingerprint of its bytes, so it can be cached
    // forever at the edge and in the browser.
    seedApplet('widgets', 'clock', {
      'index.js': '//',
      'chunk-9f.js': 'export const x=1',
      'logo-abc123.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    })
    const chunk = await serveApplet('widget', 'clock', 'chunk-9f.js', WS, BASE)
    expect(chunk.headers.get('cache-control')).toBe('public, max-age=604800, immutable')
    expect(chunk.headers.get('etag')).toBeNull()
    const asset = await serveApplet('widget', 'clock', 'logo-abc123.png', WS, BASE)
    expect(asset.headers.get('cache-control')).toBe('public, max-age=604800, immutable')
  })

  test('a non-hashed asset name fails safe — revalidated, not pinned immutable', async () => {
    // Defense in depth: the build only ever writes index.js + hashed siblings,
    // but if an un-hashed file ever landed here it must NOT be cached forever at
    // its stable url (that IS the staleness bug). Names without a recognizable
    // content hash (`banner.png`, `sprite-map.png` — `-map` isn't hex) revalidate.
    seedApplet('widgets', 'clock', {
      'index.js': '//',
      'banner.png': new Uint8Array([1]),
      'sprite-map.png': new Uint8Array([2])
    })
    for (const f of ['banner.png', 'sprite-map.png']) {
      const res = await serveApplet('widget', 'clock', f, WS, BASE)
      expect(res.headers.get('cache-control')).toBe('no-cache')
      expect(res.headers.get('etag')).toBeTruthy()
    }
  })

  test('400 for a dotfile request', async () => {
    seedApplet('views', 'editor', { 'index.js': '//' })
    expect((await serveApplet('view', 'editor', '.env', WS, BASE)).status).toBe(400)
  })

  test('404 when the file is missing', async () => {
    seedApplet('views', 'editor', { 'index.js': '//' })
    expect((await serveApplet('view', 'editor', 'nope.js', WS, BASE)).status).toBe(404)
  })

  test('400 for an invalid name or traversal/nested file', async () => {
    expect((await serveApplet('view', '../x', 'index.js', WS, BASE)).status).toBe(400)
    expect((await serveApplet('view', 'editor', '../manifest.json', WS, BASE)).status).toBe(400)
    expect((await serveApplet('view', 'editor', 'a/b.js', WS, BASE)).status).toBe(400)
  })
})

describe('buildApplets (empty/orphan handling)', () => {
  test('does not scaffold a build dir when there are no sources', async () => {
    // The phantom-scaffold half of the cwd bug: a dir with no `.moi/widgets`
    // sources must not create `.moi/.build/widgets` (which, run from inside
    // `.moi/`, was the junk nested `.moi/.moi/.build`).
    const { buildDir } = getAppletPaths(WS, 'widget')
    const { names, results } = await buildApplets(WS, 'widget', false)
    expect(names).toEqual([])
    expect(results).toEqual([])
    expect(existsSync(buildDir)).toBe(false)
  })

  test('still prunes orphaned builds when all sources are gone', async () => {
    // Build dir already exists from a prior build; every source has since been
    // deleted. We skip the mkdir but must still sweep the orphan.
    const { buildDir } = getAppletPaths(WS, 'widget')
    mkdirSync(join(buildDir, 'ghost'), { recursive: true })
    writeFileSync(join(buildDir, 'ghost', 'index.js'), '//')
    await buildApplets(WS, 'widget', false)
    expect(existsSync(join(buildDir, 'ghost'))).toBe(false)
  })
})

describe('parseAppletTail', () => {
  test('splits name/file and ignores the cache-bust query', () => {
    expect(
      parseAppletTail('http://h/api/workspaces/w1/views/editor/index.js?v=2', 'w1', 'views')
    ).toEqual({ name: 'editor', file: 'index.js' })
    expect(
      parseAppletTail('http://h/api/workspaces/w1/views/editor/chunk-9.js', 'w1', 'views')
    ).toEqual({ name: 'editor', file: 'chunk-9.js' })
    expect(
      parseAppletTail('http://h/api/workspaces/w1/widgets/clips/logo-x.png', 'w1', 'widgets')
    ).toEqual({ name: 'clips', file: 'logo-x.png' })
  })

  test('a bare name (or legacy <name>.js) targets the entry', () => {
    expect(parseAppletTail('http://h/api/workspaces/w1/widgets/clock', 'w1', 'widgets')).toEqual({
      name: 'clock',
      file: 'index.js'
    })
    expect(parseAppletTail('http://h/api/workspaces/w1/widgets/clock.js', 'w1', 'widgets')).toEqual(
      {
        name: 'clock',
        file: 'index.js'
      }
    )
  })
})

describe('apiBaseFor', () => {
  test('builds the workspace API base', () => {
    expect(apiBaseFor('abc')).toBe('/api/workspaces/abc')
  })
})

describe('serveWorkspaceFile (fileUrl streaming)', () => {
  function seedFile(rel: string, data: string | Uint8Array) {
    const path = join(WS, rel)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, data)
  }

  test('streams an allowed media file with Accept-Ranges', async () => {
    seedFile('clips/a.mp4', new Uint8Array([1, 2, 3, 4]))
    const res = await serveWorkspaceFile(WS, 'clips/a.mp4')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('video/mp4')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('content-length')).toBe('4')
  })

  test('is private + revalidated, never edge-cached (ETag + private, no-cache)', async () => {
    seedFile('clips/a.mp4', new Uint8Array([1, 2, 3, 4]))
    const res = await serveWorkspaceFile(WS, 'clips/a.mp4')
    expect(res.status).toBe(200)
    // `private` keeps the user's file off any shared/edge cache; `no-cache`
    // forces the browser to revalidate so an agent-rewritten file isn't stale.
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
    const etag = res.headers.get('etag')
    expect(etag).toBeTruthy()

    const revalidated = await serveWorkspaceFile(WS, 'clips/a.mp4', undefined, etag)
    expect(revalidated.status).toBe(304)
    expect(revalidated.headers.get('etag')).toBe(etag)
    expect(revalidated.headers.get('cache-control')).toBe('private, no-cache')
    expect(await revalidated.text()).toBe('')
  })

  test('workspace ETag uses nanosecond mtime — survives sub-millisecond rewrites', async () => {
    // The file is agent-regenerated at a stable path, so a coarse validator can
    // return a false 304 and pin stale media. Guard the resolution: a nanosecond
    // epoch timestamp is ~19 digits, a millisecond one ~13, so a revert to
    // `Math.trunc(mtimeMs)` (which could collide on a same-length rewrite inside
    // one tick) is caught here.
    seedFile('clips/a.mp4', new Uint8Array([1, 2, 3, 4]))
    const res = await serveWorkspaceFile(WS, 'clips/a.mp4')
    const mtimePart = res.headers.get('etag')!.replace(/"/g, '').split('-')[1]
    expect(mtimePart.length).toBeGreaterThanOrEqual(16)
  })

  test('a same-length rewrite changes the ETag (no false 304)', async () => {
    seedFile('clips/a.mp4', new Uint8Array([1, 2, 3, 4]))
    const etag1 = (await serveWorkspaceFile(WS, 'clips/a.mp4')).headers.get('etag')!
    // Overwrite with DIFFERENT bytes of the SAME length — the reviewer's case.
    seedFile('clips/a.mp4', new Uint8Array([9, 8, 7, 6]))
    const res = await serveWorkspaceFile(WS, 'clips/a.mp4', undefined, etag1)
    expect(res.status).toBe(200) // the stale validator must not win a 304
    expect(res.headers.get('etag')).not.toBe(etag1)
  })

  test('a range request still carries the private cache headers', async () => {
    seedFile('clips/a.mp4', new Uint8Array([10, 11, 12, 13, 14, 15]))
    const res = await serveWorkspaceFile(WS, 'clips/a.mp4', 'bytes=1-3')
    expect(res.status).toBe(206)
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
    expect(res.headers.get('etag')).toBeTruthy()
  })

  test('honors a byte range (206 + Content-Range)', async () => {
    seedFile('clips/a.mp4', new Uint8Array([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]))
    const res = await serveWorkspaceFile(WS, 'clips/a.mp4', 'bytes=2-5')
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(res.headers.get('content-length')).toBe('4')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([12, 13, 14, 15]))
  })

  test('honors an open-ended and a suffix range', async () => {
    seedFile('clips/a.mp4', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))
    const open = await serveWorkspaceFile(WS, 'clips/a.mp4', 'bytes=8-')
    expect(open.status).toBe(206)
    expect(open.headers.get('content-range')).toBe('bytes 8-9/10')
    const suffix = await serveWorkspaceFile(WS, 'clips/a.mp4', 'bytes=-3')
    expect(suffix.status).toBe(206)
    expect(suffix.headers.get('content-range')).toBe('bytes 7-9/10')
  })

  test('416 for an unsatisfiable range', async () => {
    seedFile('clips/a.mp4', new Uint8Array([1, 2, 3]))
    const res = await serveWorkspaceFile(WS, 'clips/a.mp4', 'bytes=99-200')
    expect(res.status).toBe(416)
    expect(res.headers.get('content-range')).toBe('bytes */3')
  })

  test('decodes percent-encoded path segments', async () => {
    seedFile('clips/a b.mp4', new Uint8Array([1]))
    expect((await serveWorkspaceFile(WS, 'clips/a%20b.mp4')).status).toBe(200)
  })

  test('404 for a missing media file', async () => {
    expect((await serveWorkspaceFile(WS, 'clips/missing.mp4')).status).toBe(404)
  })

  test('415 for a non-media extension — no data exfiltration', async () => {
    seedFile('secret.json', '{"k":"v"}')
    expect((await serveWorkspaceFile(WS, 'secret.json')).status).toBe(415)
  })

  test('403 for dotfiles (.env, .moi, .git)', async () => {
    seedFile('.env', 'SECRET=1')
    expect((await serveWorkspaceFile(WS, '.env')).status).toBe(403)
    // A media file nested under a dot directory is still blocked.
    expect((await serveWorkspaceFile(WS, '.moi/x.png')).status).toBe(403)
  })

  test('403 for path traversal', async () => {
    expect((await serveWorkspaceFile(WS, '../outside.mp4')).status).toBe(403)
    expect((await serveWorkspaceFile(WS, 'a/../../b.mp4')).status).toBe(403)
  })

  test('403 for a symlink that escapes the workspace root', async () => {
    // A real media file OUTSIDE the workspace, reached via an in-root symlink —
    // the lexical guard would pass; canonicalization must catch it.
    const outsideDir = mkdtempSync(join(import.meta.dir, 'moi-outside-'))
    const outside = join(outsideDir, 'secret.png')
    writeFileSync(outside, new Uint8Array([1, 2, 3]))
    try {
      mkdirSync(join(WS, 'clips'), { recursive: true })
      symlinkSync(outside, join(WS, 'clips', 'link.png'))
      expect((await serveWorkspaceFile(WS, 'clips/link.png')).status).toBe(403)
    } finally {
      rmSync(outsideDir, { recursive: true, force: true })
    }
  })

  test('allows a symlink that stays within the workspace', async () => {
    mkdirSync(join(WS, 'clips'), { recursive: true })
    writeFileSync(join(WS, 'clips', 'real.png'), new Uint8Array([9]))
    symlinkSync(join(WS, 'clips', 'real.png'), join(WS, 'clips', 'alias.png'))
    expect((await serveWorkspaceFile(WS, 'clips/alias.png')).status).toBe(200)
  })
})
