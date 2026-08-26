import { useEffect, useRef } from 'react'

import { useAppletThumbnailRecords, useSaveAppletThumbnails } from '@/client/features/applets/api'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import type { AppletKind, AppletThumbnail, AppletThumbnailUpdate } from '@/lib/types'

export const THUMBNAIL_MAX_EDGE = 1_000
export const THUMBNAIL_PIXEL_RATIO = 3
export const THUMBNAIL_FRESH_MS = 3 * 60 * 60 * 1_000
// A capture that took this long janked the main thread (the DOM clone +
// style-inline walk is synchronous). Routine age-based re-captures of such a
// target are skipped; only a rebuilt bundle earns another attempt.
export const SLOW_CAPTURE_MS = 1_000

const THUMBNAIL_FORMAT_REVISION = '1000px-3x-webp-q80-v1'
const SETTLE_MS = 5_000
const ASSET_TIMEOUT_MS = 1_000
const CAPTURE_TIMEOUT_MS = 10_000

// Content outside the capture frame is clipped from the rendered image, so
// cloning it is pure main-thread cost: the DOM clone + style-inline walk is
// synchronous and scales with node count, and a view with a few thousand list
// rows freezes the page for minutes while the user types in the chat. The
// capture filter keeps only elements that can reach the frame, padded a little
// so edge shadows survive.
export const CAPTURE_AREA_PAD_PX = 100

// Even in-frame content has a ceiling: past this many kept elements the
// synchronous clone is guaranteed to jank (measured well over SLOW_CAPTURE_MS),
// and no thumbnail is worth that. The count uses the same filter with an early
// bail, so checking is cheap no matter how big the applet's DOM is.
export const MAX_CAPTURE_NODES = 5_000

export type AppletThumbnailTarget = {
  id: string
  revision?: string
}

type AppletThumbnailCaptureTarget = AppletThumbnailTarget & {
  element: HTMLElement | null
}

type UseAppletThumbnailsArgs = {
  kind: AppletKind
  enabled: boolean
  targets: readonly AppletThumbnailTarget[]
}

type CaptureThumbnail = (element: HTMLElement, stripHostChrome: boolean) => Promise<string | null>

export function thumbnailScale(element: HTMLElement): number {
  return Math.min(
    THUMBNAIL_PIXEL_RATIO,
    THUMBNAIL_MAX_EDGE / Math.max(element.offsetWidth, element.offsetHeight)
  )
}

export function appletThumbnailRevision(bundleRevision?: string): string {
  return `${THUMBNAIL_FORMAT_REVISION}:${bundleRevision ?? ''}`
}

export function isAppletThumbnailStale(
  record: AppletThumbnail | undefined,
  revision: string,
  now = Date.now()
): boolean {
  if (!record || record.revision !== revision) return true
  const capturedAt = Date.parse(record.capturedAt)
  return !Number.isFinite(capturedAt) || now - capturedAt >= THUMBNAIL_FRESH_MS
}

// A slow target is only worth re-capturing when its bundle changed: the new
// code deserves one measured attempt. A routine age-based refresh of the same
// bundle is not worth a >1s main-thread stall for a slightly fresher image.
export function shouldSkipSlowCapture(
  record: AppletThumbnail | undefined,
  revision: string
): boolean {
  return (
    record !== undefined &&
    record.revision === revision &&
    record.captureMs !== undefined &&
    record.captureMs >= SLOW_CAPTURE_MS
  )
}

const timeoutNull = (ms: number) =>
  new Promise<null>(resolve => {
    setTimeout(() => resolve(null), ms)
  })

type CaptureRect = Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right' | 'width' | 'height'>

type CaptureRectSource = { getBoundingClientRect: () => CaptureRect }

// The clone filter: keep an element only when its box can reach the capture
// frame. Zero-size elements stay — `display: contents` wrappers and collapsed
// positioning hosts report an empty rect while their children are visible, and
// they cost nothing themselves. Excluding an element excludes its whole
// subtree, which is what makes capturing a long scrollable list cheap: every
// off-screen row costs one rect read instead of a full clone.
export function captureAreaFilter(
  root: CaptureRectSource,
  pad = CAPTURE_AREA_PAD_PX
): (node: Node) => boolean {
  const frame = root.getBoundingClientRect()
  const top = frame.top - pad
  const bottom = frame.bottom + pad
  const left = frame.left - pad
  const right = frame.right + pad
  return node => {
    // Literal ELEMENT_NODE: the global `Node` constant isn't available in the
    // DOM-less test runtime.
    if (node.nodeType !== 1) return true
    const rect = (node as Element).getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return true
    return rect.bottom > top && rect.top < bottom && rect.right > left && rect.left < right
  }
}

type CaptureTreeNode = { children: Iterable<CaptureTreeNode> } & Node

// True when the filtered clone would still visit more than `budget` elements.
// Walks exactly the subtrees the clone would, bailing out at the budget, so a
// huge but mostly off-screen DOM is answered in a few thousand rect reads.
export function exceedsCaptureBudget(
  root: CaptureTreeNode,
  keep: (node: Node) => boolean,
  budget = MAX_CAPTURE_NODES
): boolean {
  let remaining = budget
  const walk = (node: CaptureTreeNode): boolean => {
    for (const child of node.children) {
      if (!keep(child)) continue
      if (--remaining < 0) return true
      if (walk(child)) return true
    }
    return false
  }
  return walk(root)
}

async function captureThumbnail(
  element: HTMLElement,
  stripHostChrome: boolean
): Promise<string | null> {
  const { createContext, destroyContext, domToDataUrl } = await import('modern-screenshot')

  // The budget check runs before the expensive clone; a target too dense even
  // inside the frame skips capture entirely. The null result is recorded like a
  // failed capture — any previous thumbnail is kept, and the next routine
  // attempt re-runs only this cheap check.
  const keep = captureAreaFilter(element)
  if (exceedsCaptureBudget(element, keep)) return null

  const run = async () => {
    const context = await createContext(element, {
      scale: thumbnailScale(element),
      type: 'image/webp',
      quality: 0.8,
      backgroundColor: '#ffffff',
      timeout: ASSET_TIMEOUT_MS,
      filter: keep,
      ...(stripHostChrome && {
        onCreateForeignObjectSvg: (svg: SVGSVGElement) => {
          const style = document.createElement('style')
          style.textContent =
            '[data-widget-chrome] { border-radius: 0 !important; box-shadow: none !important; }' +
            '[data-widget-chrome]::after { display: none !important; }'
          svg.append(style)
        }
      })
    })
    try {
      return await domToDataUrl(context)
    } finally {
      destroyContext(context)
    }
  }

  return Promise.race([run(), timeoutNull(CAPTURE_TIMEOUT_MS)])
}

export async function collectAppletThumbnailUpdates(
  kind: AppletKind,
  records: readonly AppletThumbnail[],
  targets: readonly AppletThumbnailCaptureTarget[],
  isCancelled: () => boolean,
  capture: CaptureThumbnail = captureThumbnail,
  now = Date.now()
): Promise<AppletThumbnailUpdate[] | null> {
  const updates: AppletThumbnailUpdate[] = []

  for (const target of targets) {
    if (isCancelled()) return null
    const revision = appletThumbnailRevision(target.revision)
    const record = records.find(item => item.kind === kind && item.id === target.id)

    if (!isAppletThumbnailStale(record, revision, now)) {
      updates.push({ id: target.id, revision })
      continue
    }
    if (shouldSkipSlowCapture(record, revision)) {
      updates.push({ id: target.id, revision })
      continue
    }

    if (!target.element) {
      updates.push({ id: target.id, revision, image: null })
      continue
    }
    const started = performance.now()
    const image = await capture(target.element, kind === 'widget').catch(() => null)
    const captureMs = Math.round(performance.now() - started)
    if (isCancelled()) return null
    updates.push({ id: target.id, revision, image, captureMs })
  }

  return updates
}

// Widgets provide every visible grid cell; a view provides only its active
// frame. The lifecycle and persistence stay identical for both kinds.
export function useAppletThumbnails({ kind, enabled, targets }: UseAppletThumbnailsArgs): void {
  const workspaceId = useWorkspaceId()
  const records = useAppletThumbnailRecords(workspaceId).data
  const save = useSaveAppletThumbnails(workspaceId)
  const targetsRef = useRef(targets)
  targetsRef.current = targets
  const recordsRef = useRef(records ?? [])
  recordsRef.current = records ?? []
  const saveRef = useRef(save.mutate)
  saveRef.current = save.mutate
  const targetKey = targets.map(target => `${target.id}@${target.revision ?? ''}`).join('\n')
  // Hold the first pass until the stored records arrive — capturing against an
  // unloaded store would re-screenshot everything on every page load.
  const ready = records !== undefined

  useEffect(() => {
    if (!enabled || !ready || targetKey === '') return

    let cancelled = false
    let generation = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const schedule = () => {
      generation += 1
      const scheduledGeneration = generation
      if (timer !== undefined) clearTimeout(timer)
      if (document.visibilityState !== 'visible') return

      timer = setTimeout(async () => {
        timer = undefined
        const thumbnails = await collectAppletThumbnailUpdates(
          kind,
          recordsRef.current,
          targetsRef.current.map(target => ({
            ...target,
            element: document.querySelector<HTMLElement>(
              `[data-applet-thumbnail="${CSS.escape(`${kind}:${target.id}`)}"]`
            )
          })),
          () =>
            cancelled ||
            generation !== scheduledGeneration ||
            document.visibilityState !== 'visible'
        )
        if (!thumbnails || cancelled || document.visibilityState !== 'visible') return
        saveRef.current({ kind, thumbnails })
      }, SETTLE_MS)
    }

    document.addEventListener('visibilitychange', schedule)
    schedule()
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [enabled, kind, ready, targetKey])
}
