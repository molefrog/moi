import { useState } from 'react'

import { IconCamera, IconX } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { useSaveWidgetThumbnails } from '@/client/features/widgets/api'
import {
  captureWidgetThumbnail,
  thumbnailScale,
  widgetThumbnailsKey
} from '@/client/features/widgets/widget-snapshot'
import { cn } from '@/client/lib/cn'
import type { RefObject } from 'react'
import type { WidgetInfo } from '@/lib/types'

type SnapshotPlaygroundProps = {
  // The themed workspace panel — the search scope for widget cells.
  targetRef: RefObject<HTMLDivElement | null>
  // Widgets query data, for each widget's content tag.
  widgets: WidgetInfo[]
}

type CapturedThumbnail = {
  id: string
  dataUrl: string
  width: number
  height: number
  bytes: number
}

type SnapshotResult = {
  items: CapturedThumbnail[]
  skipped: string[]
  ms: number
  totalBytes: number
}

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`

// Rough decoded size of a data URL's base64 payload.
const dataUrlBytes = (dataUrl: string) =>
  Math.round(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4)

// Dev playground for widget thumbnail capture: forces a full re-capture of
// every widget on the grid (ignoring tags — useWidgetThumbnails owns the
// incremental path), persists the map, and shows the results with timings.
export function SnapshotPlayground({ targetRef, widgets }: SnapshotPlaygroundProps) {
  const { workspaceId } = useWorkspaceLayoutCtx()
  const save = useSaveWidgetThumbnails(workspaceId)
  const [progress, setProgress] = useState<string | null>(null)
  const [result, setResult] = useState<SnapshotResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const capture = async () => {
    const target = targetRef.current
    if (!target || progress !== null) return
    const cells = [...target.querySelectorAll<HTMLElement>('[data-snapshot-widget]')]
    if (cells.length === 0) {
      setError('No widgets on screen — open the Widgets tab.')
      return
    }
    setProgress(`0/${cells.length}`)
    setError(null)
    try {
      const started = performance.now()
      const items: CapturedThumbnail[] = []
      const skipped: string[] = []
      // Sequential on purpose: captures share the main thread, and one at a
      // time keeps the tab responsive.
      for (const [index, cell] of cells.entries()) {
        const id = cell.dataset.snapshotWidget
        if (!id) continue
        setProgress(`${index + 1}/${cells.length}`)
        const scale = thumbnailScale(cell)
        const dataUrl = await captureWidgetThumbnail(cell)
        if (dataUrl === null) {
          skipped.push(id)
          continue
        }
        items.push({
          id,
          dataUrl,
          width: Math.round(cell.offsetWidth * scale),
          height: Math.round(cell.offsetHeight * scale),
          bytes: dataUrlBytes(dataUrl)
        })
      }
      const ms = Math.round(performance.now() - started)
      const ids = cells
        .map(cell => cell.dataset.snapshotWidget)
        .filter((id): id is string => Boolean(id))
      await save.mutateAsync({
        key: widgetThumbnailsKey(ids, widgets),
        thumbnails: Object.fromEntries(items.map(item => [item.id, item.dataUrl]))
      })
      setResult({
        items,
        skipped,
        ms,
        totalBytes: items.reduce((sum, item) => sum + item.bytes, 0)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Capture failed')
    } finally {
      setProgress(null)
    }
  }

  const dismiss = () => {
    setResult(null)
    setError(null)
  }

  const open = result !== null || error !== null

  return (
    <div
      data-snapshot-ignore
      className="absolute bottom-4 left-4 z-40 flex flex-col items-start gap-2"
    >
      {open && (
        <div className="w-80 animate-in rounded-lg border border-border bg-popover p-2 shadow-md duration-200 fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between gap-2 pb-2 pl-1">
            <span className="text-xs font-medium text-foreground">Widget thumbnails</span>
            <div className="flex items-center gap-2">
              {result && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {result.items.length} widgets · {result.ms} ms · {formatBytes(result.totalBytes)}
                </span>
              )}
              <Button variant="ghost" size="icon-sm" aria-label="Close snapshot" onClick={dismiss}>
                <IconX stroke={1.75} />
              </Button>
            </div>
          </div>
          {result && (
            <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto">
              {result.items.map(item => (
                <a
                  key={item.id}
                  href={item.dataUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={`${item.id} — ${item.width}×${item.height} · ${formatBytes(item.bytes)}`}
                  className="flex min-w-0 flex-col gap-1"
                >
                  <img
                    src={item.dataUrl}
                    alt={item.id}
                    className="w-full rounded-sm border border-border bg-muted"
                  />
                  <span className="truncate text-xs text-muted-foreground">{item.id}</span>
                </a>
              ))}
            </div>
          )}
          {result && result.skipped.length > 0 && (
            <p className="px-1 pt-2 pb-1 text-xs text-destructive">
              Timed out: {result.skipped.join(', ')}
            </p>
          )}
          {error && <p className="px-1 pb-1 text-xs text-destructive">{error}</p>}
        </div>
      )}
      <Button variant="secondary" size="sm" onClick={capture} disabled={progress !== null}>
        <IconCamera stroke={1.75} className={cn(progress !== null && 'animate-pulse')} />
        {progress !== null ? `Capturing ${progress}…` : 'Snapshot'}
      </Button>
    </div>
  )
}
