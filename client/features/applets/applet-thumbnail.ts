import { useEffect, useRef } from 'react'

import { useSaveAppletThumbnails } from '@/client/features/applets/api'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import type { AppletKind, AppletThumbnail, AppletThumbnailUpdate } from '@/lib/types'

export const THUMBNAIL_MAX_EDGE = 1_000
export const THUMBNAIL_PIXEL_RATIO = 3
export const THUMBNAIL_FRESH_MS = 3 * 60 * 60 * 1_000

const THUMBNAIL_FORMAT_REVISION = '1000px-3x-webp-q80-v1'
const SETTLE_MS = 5_000
const ASSET_TIMEOUT_MS = 1_000
const CAPTURE_TIMEOUT_MS = 10_000

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

const timeoutNull = (ms: number) =>
  new Promise<null>(resolve => {
    setTimeout(() => resolve(null), ms)
  })

async function captureThumbnail(
  element: HTMLElement,
  stripHostChrome: boolean
): Promise<string | null> {
  const { createContext, destroyContext, domToDataUrl } = await import('modern-screenshot')

  const run = async () => {
    const context = await createContext(element, {
      scale: thumbnailScale(element),
      type: 'image/webp',
      quality: 0.8,
      backgroundColor: '#ffffff',
      timeout: ASSET_TIMEOUT_MS,
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

    const image = target.element
      ? await capture(target.element, kind === 'widget').catch(() => null)
      : null
    if (isCancelled()) return null
    updates.push({ id: target.id, revision, image })
  }

  return updates
}

// Widgets provide every visible grid cell; a view provides only its active
// frame. The lifecycle and persistence stay identical for both kinds.
export function useAppletThumbnails({ kind, enabled, targets }: UseAppletThumbnailsArgs): void {
  const { layout, workspaceId } = useWorkspaceLayoutCtx()
  const save = useSaveAppletThumbnails(workspaceId)
  const targetsRef = useRef(targets)
  targetsRef.current = targets
  const recordsRef = useRef(layout.appletThumbnails ?? [])
  recordsRef.current = layout.appletThumbnails ?? []
  const saveRef = useRef(save.mutate)
  saveRef.current = save.mutate
  const targetKey = targets.map(target => `${target.id}@${target.revision ?? ''}`).join('\n')

  useEffect(() => {
    if (!enabled || targetKey === '') return

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
  }, [enabled, kind, targetKey])
}
