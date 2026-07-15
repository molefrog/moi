import { useEffect, useRef, useState } from 'react'

import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { useSaveWidgetThumbnails } from '@/client/features/widgets/api'
import {
  captureWidgetThumbnail,
  widgetThumbnailsKey
} from '@/client/features/widgets/widget-snapshot'
import type { RefObject } from 'react'
import type { WidgetInfo } from '@/lib/types'

// Grace period between "the grid changed" and the capture pass — lets widget
// bundles mount and their data requests land so we don't snapshot skeletons.
const SETTLE_MS = 5_000

type UseWidgetThumbnailsArgs = {
  // Scope for [data-snapshot-widget] cell lookups.
  containerRef: RefObject<HTMLElement | null>
  // Widgets query data — supplies each widget's bundle tag.
  widgets: WidgetInfo[]
  // Widget ids currently on the grid.
  visibleIds: string[]
  // Edit mode pauses capture (cells wiggle, cards can be mid-drag).
  editing: boolean
}

// Keeps the workspace's widget thumbnails fresh while the Widgets tab is open.
//
// One-number invalidation: the grid state is fingerprinted into a single key
// (visible ids + bundle tags). When the stored key differs, ALL visible
// widgets are re-captured in one pass and saved through their own endpoint
// (PUT .../thumbnails) — the layout PUT never carries the base64 map. The
// key is stamped even if some captures fail, so a broken widget can't loop
// the pass; entries merge server-side and are never pruned.
export function useWidgetThumbnails({
  containerRef,
  widgets,
  visibleIds,
  editing
}: UseWidgetThumbnailsArgs) {
  const { layout, workspaceId } = useWorkspaceLayoutCtx()
  const save = useSaveWidgetThumbnails(workspaceId)
  // Latest `mutate` without widening the effect deps (mirrors the saveRef
  // pattern in WorkspaceLayoutProvider).
  const saveRef = useRef(save.mutate)
  saveRef.current = save.mutate
  const busyRef = useRef(false)
  const [pass, setPass] = useState(0)

  const key = widgetThumbnailsKey(visibleIds, widgets)
  const stale = key !== '' && key !== layout.widgetThumbnailsKey

  useEffect(() => {
    if (!stale || editing) return

    // Hidden tab: timers are throttled and the captured frame may be stale —
    // wait for visibility instead, then re-run this effect.
    if (document.visibilityState !== 'visible') {
      const onVisible = () => setPass(p => p + 1)
      document.addEventListener('visibilitychange', onVisible, { once: true })
      return () => document.removeEventListener('visibilitychange', onVisible)
    }

    // Set when the effect re-runs or unmounts mid-pass (grid changed, tab
    // closed). A cancelled pass must not save: its captures are partial, and
    // stamping `key` over them would mark the set fresh with images missing.
    let cancelled = false
    const timer = setTimeout(async () => {
      if (busyRef.current) return
      busyRef.current = true
      try {
        const captured: Record<string, string> = {}
        for (const id of visibleIds) {
          if (cancelled) return
          const cell = containerRef.current?.querySelector<HTMLElement>(
            `[data-snapshot-widget="${CSS.escape(id)}"]`
          )
          const image = cell ? await captureWidgetThumbnail(cell) : null
          if (image) captured[id] = image
        }
        if (cancelled) return
        // The mutation's onMutate stamps the key into the local layout cache;
        // the PUT itself is best-effort (a failed save just means a
        // re-capture after reload).
        saveRef.current({ key, thumbnails: captured })
      } finally {
        busyRef.current = false
        // Re-evaluate: a pass skipped on `busy`, or a key that moved while
        // this pass ran, gets picked up next round; a fresh key is a no-op.
        setPass(p => p + 1)
      }
    }, SETTLE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, stale, editing, pass])
}
