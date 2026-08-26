import { describe, expect, test } from 'bun:test'

import type { AppletThumbnail } from '@/lib/types'

import {
  CAPTURE_AREA_PAD_PX,
  SLOW_CAPTURE_MS,
  THUMBNAIL_FRESH_MS,
  THUMBNAIL_MAX_EDGE,
  THUMBNAIL_PIXEL_RATIO,
  appletThumbnailRevision,
  captureAreaFilter,
  collectAppletThumbnailUpdates,
  exceedsCaptureBudget,
  isAppletThumbnailStale,
  shouldSkipSlowCapture,
  thumbnailScale
} from './applet-thumbnail'

function element(width = 200, height = 100): HTMLElement {
  return { offsetWidth: width, offsetHeight: height } as HTMLElement
}

type FakeRect = { top: number; bottom: number; left: number; right: number }

type FakeNode = {
  nodeType: number
  children: FakeNode[]
  getBoundingClientRect: () => FakeRect & { width: number; height: number }
}

function box(rect: Partial<FakeRect>, children: FakeNode[] = [], nodeType = 1): FakeNode {
  const full = { top: 0, bottom: 0, left: 0, right: 0, ...rect }
  return {
    nodeType,
    children,
    getBoundingClientRect: () => ({
      ...full,
      width: full.right - full.left,
      height: full.bottom - full.top
    })
  }
}

// The 100×100 capture frame the filter tests are laid out against.
const frame = () => box({ top: 0, bottom: 100, left: 0, right: 100 })

const asNode = (node: FakeNode) => node as unknown as Node

function record(overrides: Partial<AppletThumbnail> = {}): AppletThumbnail {
  return {
    kind: 'widget',
    id: 'one',
    revision: appletThumbnailRevision('bundle-1'),
    capturedAt: new Date(10_000).toISOString(),
    viewedAt: new Date(10_000).toISOString(),
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

  test('skips slow re-captures of an unchanged bundle but retries a rebuilt one', () => {
    const revision = appletThumbnailRevision('bundle-1')
    const slow = record({ captureMs: SLOW_CAPTURE_MS })
    expect(shouldSkipSlowCapture(slow, revision)).toBe(true)
    expect(shouldSkipSlowCapture(record({ captureMs: SLOW_CAPTURE_MS - 1 }), revision)).toBe(false)
    expect(shouldSkipSlowCapture(record({ captureMs: undefined }), revision)).toBe(false)
    // A rebuilt bundle earns one measured attempt even on a slow target.
    expect(shouldSkipSlowCapture(slow, appletThumbnailRevision('bundle-2'))).toBe(false)
    expect(shouldSkipSlowCapture(undefined, revision)).toBe(false)
  })

  test('keeps only content that can reach the padded capture frame', () => {
    const keep = captureAreaFilter(frame())
    // In frame, and within the pad below it.
    expect(keep(asNode(box({ top: 10, bottom: 30, left: 0, right: 100 })))).toBe(true)
    expect(
      keep(asNode(box({ top: 100 + CAPTURE_AREA_PAD_PX - 1, bottom: 200, left: 0, right: 100 })))
    ).toBe(true)
    // Scrolled past the pad — the subtree the clone can skip entirely.
    expect(
      keep(asNode(box({ top: 100 + CAPTURE_AREA_PAD_PX, bottom: 300, left: 0, right: 100 })))
    ).toBe(false)
    expect(keep(asNode(box({ top: 0, bottom: 100, left: 300, right: 400 })))).toBe(false)
    // Zero-size wrappers (display: contents, collapsed positioning hosts) and
    // non-element nodes always pass.
    expect(keep(asNode(box({ top: 5000, bottom: 5000, left: 0, right: 0 })))).toBe(true)
    expect(keep(asNode(box({ top: 5000, bottom: 6000, left: 0, right: 100 }, [], 3)))).toBe(true)
  })

  test('bounds the capture budget by kept elements only', () => {
    const keep = captureAreaFilter(frame())
    const inFrameRow = (i: number) => box({ top: i, bottom: i + 1, left: 0, right: 100 })
    const offscreenRow = (i: number) =>
      box({ top: 10_000 + i, bottom: 10_001 + i, left: 0, right: 100 }, [
        box({ top: 10_000 + i, bottom: 10_001 + i, left: 0, right: 50 })
      ])

    const rows = Array.from({ length: 5 }, (_, i) => inFrameRow(i))
    const mostlyOffscreen = box({ top: 0, bottom: 20_000, left: 0, right: 100 }, [
      ...rows,
      ...Array.from({ length: 50 }, (_, i) => offscreenRow(i))
    ])
    // 5 kept rows; the 50 off-screen rows (and their children) never count.
    // FakeNode satisfies the walk structurally — cast through unknown because
    // it is not a real DOM Node.
    const root = mostlyOffscreen as unknown as Parameters<typeof exceedsCaptureBudget>[0]
    expect(exceedsCaptureBudget(root, keep, 5)).toBe(false)
    expect(exceedsCaptureBudget(root, keep, 4)).toBe(true)
  })

  test('touches fresh targets and captures stale targets sequentially', async () => {
    let captures = 0
    const updates = await collectAppletThumbnailUpdates(
      'widget',
      [record()],
      [
        { id: 'one', revision: 'bundle-1', element: element() },
        { id: 'two', revision: 'bundle-2', element: element() }
      ],
      () => false,
      async () => {
        captures += 1
        return 'new-image'
      },
      10_000
    )

    expect(captures).toBe(1)
    expect(updates).toEqual([
      { id: 'one', revision: appletThumbnailRevision('bundle-1') },
      {
        id: 'two',
        revision: appletThumbnailRevision('bundle-2'),
        image: 'new-image',
        captureMs: expect.any(Number)
      }
    ])
  })

  test('sends a touch instead of re-capturing a slow target whose bundle is unchanged', async () => {
    let captures = 0
    const slow = record({
      captureMs: SLOW_CAPTURE_MS,
      capturedAt: new Date(0).toISOString()
    })
    const updates = await collectAppletThumbnailUpdates(
      'widget',
      [slow],
      [{ id: 'one', revision: 'bundle-1', element: element() }],
      () => false,
      async () => {
        captures += 1
        return 'image'
      },
      THUMBNAIL_FRESH_MS + 1
    )

    expect(captures).toBe(0)
    expect(updates).toEqual([{ id: 'one', revision: appletThumbnailRevision('bundle-1') }])
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
      {
        id: 'dashboard',
        revision: appletThumbnailRevision('r1'),
        image: 'view-image',
        captureMs: expect.any(Number)
      }
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
