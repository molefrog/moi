import { describe, expect, test } from 'bun:test'

import {
  appletKey,
  appletUrl,
  appletVersion,
  getCachedApplet,
  invalidateApplet,
  setCachedApplet
} from './applet-cache'

// These cover the mount-independent invalidation that fixes the "edited a view
// in a background tab → stale on switch" bug: a rebuild must bump the applet's
// version (so its import URL changes) and drop any cached module, even though no
// component for it is mounted to receive the event.

describe('appletKey', () => {
  test('namespaces by segment + workspace + name', () => {
    expect(appletKey('views', 'ws1', 'board')).toBe('views/ws1/board')
    // A widget and a view sharing a name must not collide.
    expect(appletKey('widgets', 'ws1', 'board')).not.toBe(appletKey('views', 'ws1', 'board'))
  })
})

describe('appletUrl + version', () => {
  test('starts at v=0 and bumps on each invalidate', () => {
    const seg = 'views'
    const ws = `wsv-${crypto.randomUUID()}`
    expect(appletVersion(seg, ws, 'a')).toBe(0)
    expect(appletUrl(seg, ws, 'a')).toBe(`/api/workspaces/${ws}/views/a/index.js?v=0`)

    invalidateApplet(seg, ws, 'a')
    expect(appletVersion(seg, ws, 'a')).toBe(1)
    expect(appletUrl(seg, ws, 'a')).toBe(`/api/workspaces/${ws}/views/a/index.js?v=1`)

    invalidateApplet(seg, ws, 'a')
    expect(appletUrl(seg, ws, 'a')).toBe(`/api/workspaces/${ws}/views/a/index.js?v=2`)
  })

  test('versions are independent per applet', () => {
    const ws = `wsv-${crypto.randomUUID()}`
    invalidateApplet('views', ws, 'a')
    expect(appletVersion('views', ws, 'a')).toBe(1)
    expect(appletVersion('views', ws, 'b')).toBe(0)
    expect(appletVersion('widgets', ws, 'a')).toBe(0)
  })
})

describe('invalidateApplet drops the cached module', () => {
  test('a previously-cached module is evicted so the next load re-fetches', () => {
    const ws = `wsc-${crypto.randomUUID()}`
    const key = appletKey('views', ws, 'board')
    const mod = Promise.resolve({ default: () => null })
    setCachedApplet(key, mod)
    expect(getCachedApplet(key)).toBe(mod)

    // Simulate a background-tab rebuild: invalidate without anything mounted.
    invalidateApplet('views', ws, 'board')
    expect(getCachedApplet(key)).toBeUndefined()
    // And the URL the next load uses is now a fresh version.
    expect(appletUrl('views', ws, 'board')).toBe(`/api/workspaces/${ws}/views/board/index.js?v=1`)
  })
})
