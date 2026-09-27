import { describe, expect, test } from 'bun:test'
import {
  addressPath,
  canonicalSearch,
  legacyTabFromPath,
  moiHref,
  parseMoiHref,
  readViewParams,
  resolveWorkspaceHref,
  tabFromPath,
  workspaceTabPath
} from './navigation'

describe('workspace addresses', () => {
  test('tab IDs are the workspace-relative paths', () => {
    expect(parseMoiHref('moi:/views/events?eventId=123').tab).toBe('views/events')
    expect(workspaceTabPath('ws1', 'views/events')).toBe('/workspace/ws1/views/events')
  })

  test('old browser bookmarks resolve without accepting legacy tab IDs in new addresses', () => {
    expect(legacyTabFromPath('view:orders')).toBe('views/orders')
    expect(legacyTabFromPath('view-builder:abc')).toBe('view-builders/abc')
    expect(legacyTabFromPath('view:%65vents')).toBe('views/events')
    expect(legacyTabFromPath('view:%2565vents')).toBeNull()
    expect(legacyTabFromPath('view:a/b')).toBeNull()
    expect(legacyTabFromPath('views/orders')).toBeNull()
    expect(() => parseMoiHref('moi:/view:orders')).toThrow()
  })

  test('round trips a destination independently of workspace, origin, and deployment prefix', () => {
    const href = 'moi:/views/events?eventId=123'
    const address = parseMoiHref(href)
    expect(moiHref(address.tab, address.search)).toBe(href)
    expect(addressPath('abc', address)).toBe('/workspace/abc/views/events?eventId=123')
    expect(addressPath('other', address, '/prefix/')).toBe(
      '/prefix/workspace/other/views/events?eventId=123'
    )
    expect(resolveWorkspaceHref('abc', href)).toBe('/workspace/abc/views/events?eventId=123')
  })
  test('accepts encoded IDs supported by the applet server', () => {
    expect(parseMoiHref('moi:/views/%65vents_2026-09').tab).toBe('views/events_2026-09')
  })

  test('query values remain strings and follow URLSearchParams.get semantics', () => {
    const values = { title: 'Grüße & a/b?c=#100% +', enabled: 'false', page: '02', empty: '' }
    const href = `moi:/views/events?${new URLSearchParams(values)}`
    expect(readViewParams(parseMoiHref(href).search)).toEqual(values)
    expect(readViewParams('?x=1&x=2')).toEqual({ x: '1' })
    expect(readViewParams('?x=&x=2')).toEqual({ x: '' })
    expect(canonicalSearch('?b=2&a=1&b=3')).toBe('?a=1&b=2&b=3')
    expect(readViewParams(parseMoiHref('moi:/views/events?x=1&x=2').search)).toEqual({ x: '1' })
    expect(readViewParams('')).toEqual({})
    expect(Object.hasOwn(readViewParams('__proto__=safe'), '__proto__')).toBe(true)
  })
  test('rejects ambiguous, malformed, private, and unsupported destinations', () => {
    for (const href of [
      null,
      2,
      '',
      '/views/events',
      'view:events',
      'moi://views/events',
      'moi:/views/',
      'moi:/views/a/b',
      'moi:/views/%2f',
      'moi:/views/%',
      'moi:/views/100%25',
      'moi:/views/my.events',
      'moi:/views/Gr%C3%BC%C3%9Fe%20events',
      'moi:/views/../overview',
      'moi:/views/a#part',
      'moi:/agent',
      'moi:/view-builders/a',
      'moi:/chats/a',
      'moi:/files/a.md'
    ]) {
      expect(() => parseMoiHref(href)).toThrow()
    }
  })
  test('host-only tabs still round trip without becoming portable destinations', () => {
    for (const tab of [
      'agent',
      'overview',
      'scratchpad',
      'views/events',
      'view-builders/abc'
    ] as const) {
      expect(tabFromPath(tab)).toBe(tab)
    }
  })
  test('web hrefs stay web hrefs; executable protocols cannot use the API', () => {
    expect(resolveWorkspaceHref('abc', 'https://example.com/a?q=b')).toBe(
      'https://example.com/a?q=b'
    )
    expect(() => resolveWorkspaceHref('abc', 'javascript:alert(1)')).toThrow()
    expect(() => resolveWorkspaceHref('abc', 'data:text/html,hello')).toThrow()
  })
})
