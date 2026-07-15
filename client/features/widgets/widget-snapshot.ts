// Widget thumbnail capture: renders one live grid cell (tagged with
// `data-snapshot-widget` in WidgetGrid) to a WebP data URL via
// modern-screenshot — white background, the widget's own aspect ratio, frame
// chrome stripped. Shared by the automatic invalidation hook
// (useWidgetThumbnails) and the dev SnapshotPlayground.
import type { WidgetInfo } from '@/lib/types'

// Long edge of a stored thumbnail, in output px. Placeholder until the real
// target resolution is decided.
export const THUMB_MAX_EDGE = 400

// How long modern-screenshot waits per image/asset before rendering without
// it. The library default is 30s, which reads as a hang on any widget whose
// image never loads (lazy-loaded offscreen, CORS-blocked, dead URL).
const ASSET_TIMEOUT_MS = 1_000

// Hard cap for one widget's whole capture. If it blows past this, the capture
// resolves null and the caller moves on — a snapshot pass must never wedge.
const WIDGET_TIMEOUT_MS = 10_000

export const thumbnailScale = (cell: HTMLElement) =>
  Math.min(1, THUMB_MAX_EDGE / Math.max(cell.offsetWidth, cell.offsetHeight))

// Fingerprint of the grid state a thumbnail set was captured from: which
// widgets are on the grid and which bundle build (`WidgetInfo.tag`) each one
// runs. Order-independent. Any change — add, remove, rebundle — changes the
// key and triggers a full re-capture.
export const widgetThumbnailsKey = (visibleIds: string[], widgets: WidgetInfo[]) => {
  const tagById = new Map(widgets.map(w => [w.id, w.tag]))
  return [...visibleIds]
    .sort()
    .map(id => `${id}@${tagById.get(id) ?? ''}`)
    .join(' ')
}

const timeoutNull = (ms: number) =>
  new Promise<null>(resolve => {
    setTimeout(() => resolve(null), ms)
  })

export async function captureWidgetThumbnail(cell: HTMLElement): Promise<string | null> {
  const { createContext, destroyContext, domToDataUrl } = await import('modern-screenshot')

  const run = async () => {
    const context = await createContext(cell, {
      scale: thumbnailScale(cell),
      type: 'image/webp',
      quality: 0.8,
      backgroundColor: '#ffffff',
      timeout: ASSET_TIMEOUT_MS,
      // Strip the frame chrome inside the capture only. Computed styles are
      // inlined onto the clone, so a wrapper selector can't reach them — but a
      // stylesheet injected into the generated SVG can: !important rules beat
      // inline styles and the copied ::after.
      onCreateForeignObjectSvg: svg => {
        const style = document.createElement('style')
        style.textContent =
          '[data-widget-chrome] { border-radius: 0 !important; box-shadow: none !important; }' +
          '[data-widget-chrome]::after { display: none !important; }'
        svg.append(style)
      }
    })
    try {
      return await domToDataUrl(context)
    } finally {
      destroyContext(context)
    }
  }

  return Promise.race([run(), timeoutNull(WIDGET_TIMEOUT_MS)])
}
