import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { serveVendorEmojibase, serveVendorReact } from '../vendor'

const VENDOR = join(import.meta.dir, '..', '..', 'client', 'vendor', 'react')
const ENTRIES = [
  'react.js',
  'react-jsx-runtime.js',
  'react-jsx-dev-runtime.js',
  'react-dom.js',
  'react-dom-client.js'
]

// The importmap in client/index.html resolves these; the app is fully broken
// (and offline claims are false) if the committed artifacts are missing,
// truncated, or still reference a CDN. Regenerate with `bun run vendor:react`.
describe('vendored React artifacts', () => {
  for (const mode of ['production', 'development'] as const) {
    for (const name of ENTRIES) {
      test(`${mode}/${name} exists and is non-trivial`, async () => {
        const file = Bun.file(join(VENDOR, mode, name))
        expect(await file.exists()).toBe(true)
        const text = await file.text()
        expect(text).toContain('export default')
        // No CDN references anywhere — the whole point is offline operation.
        expect(text).not.toContain('esm.sh')
      })
    }
    test(`${mode}/react.js exposes named exports (not default-only)`, async () => {
      const text = await Bun.file(join(VENDOR, mode, 'react.js')).text()
      expect(text).toContain('export const useState')
      expect(text).toContain('export const useEffect')
    })
  }
})

describe('serveVendorReact route', () => {
  const get = (path: string) => serveVendorReact(new Request(`http://localhost${path}`))

  test('serves the react entry as JavaScript', async () => {
    const res = await get('/vendor/react/react.js')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('javascript')
    expect(await res.text()).toContain('export default')
  })

  test('serves nested _impl files', async () => {
    const res = await get('/vendor/react/_impl/react.js')
    expect(res.status).toBe(200)
  })

  test('rejects path traversal', async () => {
    // URL normalizes `..`, so the tail no longer starts with the vendor prefix.
    expect((await get('/vendor/react/../../server/vendor.ts')).status).toBe(404)
    expect((await get('/vendor/react/%2e%2e/secret.js')).status).toBe(404)
  })

  test('rejects non-js and unknown files', async () => {
    expect((await get('/vendor/react/react.txt')).status).toBe(404)
    expect((await get('/vendor/react/does-not-exist.js')).status).toBe(404)
  })
})

// The settings emoji picker (frimousse) loads its dataset from here instead of
// the jsdelivr CDN — same offline story as vendored React.
describe('serveVendorEmojibase route', () => {
  const get = (path: string) => serveVendorEmojibase(new Request(`http://localhost${path}`))

  test('serves the en dataset as JSON', async () => {
    for (const name of ['data.json', 'messages.json']) {
      const res = await get(`/vendor/emojibase/en/${name}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('json')
      // Non-trivial payload, and it parses.
      expect(Array.isArray(await res.json()) || name === 'messages.json').toBe(true)
    }
  })

  test('rejects traversal and unknown files', async () => {
    expect((await get('/vendor/emojibase/../react/react.js')).status).toBe(404)
    expect((await get('/vendor/emojibase/en/%2e%2e/data.json')).status).toBe(404)
    expect((await get('/vendor/emojibase/en/data.js')).status).toBe(404)
    expect((await get('/vendor/emojibase/xx/data.json')).status).toBe(404)
  })
})
