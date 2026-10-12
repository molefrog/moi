import { describe, expect, test } from 'bun:test'
import { resolveUrl } from './navigation'

const context = { workspaceId: 'abc' }

describe('resolveUrl', () => {
  test.each(['overview', 'scratchpad', 'views/events', 'chat', 'chats/session-1'])(
    'resolves %s inside the supplied workspace',
    path => {
      expect(resolveUrl(`moi:/${path}`, context)).toBe(`/workspace/abc/${path}`)
      expect(resolveUrl(`moi:/${path}`, { workspaceId: 'other', base: '/prefix/' })).toBe(
        `/prefix/workspace/other/${path}`
      )
    }
  )

  test('normalizes portable addresses for CLI validation without a workspace', () => {
    expect(resolveUrl('moi:/views/%65vents?b=2&a=1')).toBe('moi:/views/events?a=1&b=2')
    expect(resolveUrl('moi:/chats/provider%3Aid', context)).toBe(
      '/workspace/abc/chats/provider%3Aid'
    )
    expect(resolveUrl('moi:/chats/%252f', context)).toBe('/workspace/abc/chats/%252f')
    expect(resolveUrl('moi:/views/events', { workspaceId: 'a/b' })).toBe(
      '/workspace/a%2Fb/views/events'
    )
  })

  test('encodes query values once and preserves repeated values', () => {
    const values = { title: 'Grüße & a/b?c=#100% +', enabled: 'false', page: '02', empty: '' }
    const resolved = new URL(
      resolveUrl(`moi:/views/events?${new URLSearchParams(values)}`, context),
      'https://moi.test'
    )
    for (const [key, value] of Object.entries(values))
      expect(resolved.searchParams.get(key)).toBe(value)
    expect(resolveUrl('moi:/views/events?b=2&x=1&x=2&a=1', context)).toBe(
      '/workspace/abc/views/events?a=1&b=2&x=1&x=2'
    )
  })

  test('rejects malformed or unsupported addresses, including retired bookmarks', () => {
    for (const href of [
      null,
      2,
      '',
      '/views/events',
      'view:events',
      'moi://views/events',
      'moi:/view:events',
      'moi:/agent',
      'moi:/views/',
      'moi:/views/a/b',
      'moi:/views/%2f',
      'moi:/views/%',
      'moi:/views/100%25',
      'moi:/views/my.events',
      'moi:/views/Gr%C3%BC%C3%9Fe%20events',
      'moi:/views/../overview',
      'moi:/views/a#part',
      'moi:/view-builders/a',
      'moi:/chat/',
      'moi:/chat#part',
      'moi:/chats/',
      'moi:/chats/a/b',
      'moi:/chats/%2f',
      'moi:/chats/%',
      'moi:/chats/%00',
      'moi:/chats/..'
    ])
      expect(() => resolveUrl(href, context)).toThrow()
  })

  test('keeps ordinary web addresses and rejects executable protocols', () => {
    expect(resolveUrl('https://example.com/a?q=b', context)).toBe('https://example.com/a?q=b')
    expect(() => resolveUrl('javascript:alert(1)', context)).toThrow()
    expect(() => resolveUrl('data:text/html,hello', context)).toThrow()
  })

  test('resolves files through their API endpoint, including before a bridge attaches', () => {
    expect(resolveUrl('moi:/files/clips/video.mp4', context)).toBe(
      '/api/workspaces/abc/files/clips/video.mp4'
    )
    expect(resolveUrl('moi:/files/photo.png', { workspaceId: 'abc', base: '/prefix' })).toBe(
      '/api/workspaces/abc/files/photo.png'
    )
    expect(resolveUrl('moi:/files/photo.png', { apiBase: '__APPLET_API_BASE__' })).toBe(
      '__APPLET_API_BASE__/files/photo.png'
    )
  })

  test('encodes file names once and preserves file queries and media fragments', () => {
    expect(resolveUrl('moi:/files/clips/Grüße intro.mp4', context)).toBe(
      '/api/workspaces/abc/files/clips/Gr%C3%BC%C3%9Fe%20intro.mp4'
    )
    expect(resolveUrl('moi:/files/clips/100%25%3F%23%20intro.mp4', context)).toBe(
      '/api/workspaces/abc/files/clips/100%25%3F%23%20intro.mp4'
    )
    expect(resolveUrl('moi:/files/literal%252F.png', context)).toBe(
      '/api/workspaces/abc/files/literal%252F.png'
    )
    expect(resolveUrl('moi:/files/video.mp4?version=2#t=10,20', context)).toBe(
      '/api/workspaces/abc/files/video.mp4?version=2#t=10,20'
    )
  })

  test('rejects unsafe file paths before URL normalization can hide traversal', () => {
    for (const path of [
      'moi://files/photo.png',
      'moi:/files/',
      'moi:/files/clips//video.mp4',
      'moi:/files/clips/../video.mp4',
      'moi:/files/clips/./video.mp4',
      'moi:/files/clips/%2e%2e/video.mp4',
      'moi:/files/clips%2Fvideo.mp4',
      'moi:/files/clips%5Cvideo.mp4',
      'moi:/files/clips\\video.mp4',
      'moi:/files/clips/%00.mp4',
      'moi:/files/clips/100%.mp4',
      'moi:/files/clips/%C3.mp4'
    ])
      expect(() => resolveUrl(path, context)).toThrow()
  })
})
