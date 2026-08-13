import { describe, expect, test } from 'bun:test'

import type { AppletThumbnail } from '@/lib/types'

import {
  THUMBNAIL_FRESH_MS,
  THUMBNAIL_MAX_EDGE,
  THUMBNAIL_PIXEL_RATIO,
  appletThumbnailRevision,
  collectAppletThumbnailUpdates,
  isAppletThumbnailStale,
  thumbnailScale
} from './applet-thumbnail'

function element(width = 200, height = 100): HTMLElement {
  return { offsetWidth: width, offsetHeight: height } as HTMLElement
}

function record(overrides: Partial<AppletThumbnail> = {}): AppletThumbnail {
  return {
    kind: 'widget',
    id: 'one',
    revision: appletThumbnailRevision('bundle-1'),
    capturedAt: new Date(10_000).toISOString(),
    viewedAt: new Date(10_000).toISOString(),
    image: 'old-image',
    ...overrides
  }
}

describe('applet thumbnails', () => {
  test('caps the long edge at 1000 output pixels', () => {
    const scale = thumbnailScale(element(2_000, 1_000))
    expect(THUMBNAIL_MAX_EDGE).toBe(1_000)
    expect(scale).toBe(0.5)
    expect(2_000 * scale).toBe(1_000)
    expect(1_000 * scale).toBe(500)
  })

  test('enlarges small targets up to 3x', () => {
    expect(thumbnailScale(element(640, 360))).toBe(1_000 / 640)
    expect(thumbnailScale(element())).toBe(THUMBNAIL_PIXEL_RATIO)
  })

  test('includes capture settings and the bundle in the stored revision', () => {
    expect(appletThumbnailRevision('bundle-1')).toContain('1000px-3x-webp-q80-v1')
    expect(appletThumbnailRevision('bundle-1')).not.toBe(appletThumbnailRevision('bundle-2'))
  })

  test('treats missing, mismatched, and three-hour-old records as stale', () => {
    const revision = appletThumbnailRevision('bundle-1')
    expect(isAppletThumbnailStale(undefined, revision, 10_000)).toBe(true)
    expect(isAppletThumbnailStale(record({ revision: 'old' }), revision, 10_000)).toBe(true)
    expect(isAppletThumbnailStale(record(), revision, 10_000 + THUMBNAIL_FRESH_MS - 1)).toBe(false)
    expect(isAppletThumbnailStale(record(), revision, 10_000 + THUMBNAIL_FRESH_MS)).toBe(true)
  })

  test('touches fresh targets and captures stale targets sequentially', async () => {
    const captures: string[] = []
    const updates = await collectAppletThumbnailUpdates(
      'widget',
      [record()],
      [
        { id: 'one', revision: 'bundle-1', element: element() },
        {
          id: 'two',
          revision: 'bundle-2',
          element: element()
        }
      ],
      () => false,
      async (_element, stripHostChrome) => {
        captures.push(stripHostChrome ? 'two' : 'one')
        return 'new-image'
      },
      10_000
    )

    expect(captures).toEqual(['two'])
    expect(updates).toEqual([
      { id: 'one', revision: appletThumbnailRevision('bundle-1') },
      { id: 'two', revision: appletThumbnailRevision('bundle-2'), image: 'new-image' }
    ])
  })

  test('captures one active view target and stops a cancelled batch', async () => {
    const viewUpdates = await collectAppletThumbnailUpdates(
      'view',
      [],
      [{ id: 'dashboard', revision: 'r1', element: element() }],
      () => false,
      async () => 'view-image'
    )
    expect(viewUpdates).toEqual([
      { id: 'dashboard', revision: appletThumbnailRevision('r1'), image: 'view-image' }
    ])

    let cancelled = false
    let captures = 0
    const cancelledUpdates = await collectAppletThumbnailUpdates(
      'widget',
      [],
      [
        { id: 'one', element: element() },
        { id: 'two', element: element() }
      ],
      () => cancelled,
      async () => {
        captures += 1
        cancelled = true
        return 'image'
      }
    )
    expect(cancelledUpdates).toBeNull()
    expect(captures).toBe(1)
  })
})
