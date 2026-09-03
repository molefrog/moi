import { useEffect, useRef } from 'react'

import { findWidgetPosition } from '@/client/features/overview/grid'
import type { LayoutGridItem, WidgetInfo, WorkspaceLayout } from '@/lib/types'

type WidgetSize = { w: number; h: number }

export function getWidgetSizes(widgets: readonly WidgetInfo[]): Map<string, WidgetSize> {
  return new Map(
    widgets.map(widget => [widget.id, { w: widget.config.colSpan, h: widget.config.rowSpan }])
  )
}

export function reconcileWidgetGrid(
  widgetGrid: readonly LayoutGridItem[],
  widgets: readonly WidgetInfo[],
  previousSizes: ReadonlyMap<string, WidgetSize>
): LayoutGridItem[] | null {
  const gridIds = new Set(widgetGrid.map(item => item.i))
  const needsPositioning = widgets.filter(widget => {
    const previous = previousSizes.get(widget.id)
    if (!previous) return !gridIds.has(widget.id)
    if (!gridIds.has(widget.id)) return false
    return previous.w !== widget.config.colSpan || previous.h !== widget.config.rowSpan
  })
  if (needsPositioning.length === 0) return null

  const repositionedIds = new Set(needsPositioning.map(widget => widget.id))
  const configById = new Map(widgets.map(widget => [widget.id, widget.config]))
  const kept = widgetGrid
    .filter(item => !repositionedIds.has(item.i) && configById.has(item.i))
    .map(item => {
      const config = configById.get(item.i)!
      return {
        ...item,
        w: config.colSpan,
        h: config.rowSpan
      }
    })

  const next = kept.map(({ i, x, y }) => ({ i, x, y }))
  const placed = [...kept]
  for (const widget of needsPositioning) {
    const position = findWidgetPosition(placed, widget.config.colSpan, widget.config.rowSpan)
    next.push({ i: widget.id, ...position })
    placed.push({
      i: widget.id,
      ...position,
      w: widget.config.colSpan,
      h: widget.config.rowSpan
    })
  }
  return next
}

// Rebalances the widget grid as the (server-authoritative) widget set changes.
// The widgets list is the source of truth for what exists; the layout grid only
// carries positions. Placement is derived here and persisted via `setLayout`
// (the layout mutation):
//   - a brand-new widget (never seen) with no grid slot → gets packed in
//   - a visible widget whose config size changed → re-packed
//   - a widget the user hid (known, absent from the grid) → left hidden
//
// On the first resolution per workspace nothing is placed: the saved grid is
// authoritative, so hidden widgets stay hidden and visible ones keep positions.
// This runs on every widgets change (including focus/switch-back refetches) but
// is a no-op when the set is unchanged, so it never loops or un-hides widgets.
export function useGridReconcile(
  workspaceId: string,
  widgets: WidgetInfo[] | undefined,
  layout: WorkspaceLayout,
  setLayout: (update: Partial<WorkspaceLayout>) => void
) {
  // Last-seen widget sizes, scoped to the workspace it was recorded for.
  const baseline = useRef<{
    workspaceId: string
    sizes: Map<string, { w: number; h: number }>
  } | null>(null)

  useEffect(() => {
    if (!widgets) return
    const sizes = getWidgetSizes(widgets)

    // First sight of this workspace's widgets — trust the saved grid, move nothing.
    if (baseline.current?.workspaceId !== workspaceId) {
      baseline.current = { workspaceId, sizes }
      return
    }

    const nextGrid = reconcileWidgetGrid(layout.widgetGrid, widgets, baseline.current.sizes)
    baseline.current = { workspaceId, sizes }
    if (nextGrid) setLayout({ widgetGrid: nextGrid })
  }, [workspaceId, widgets, layout.widgetGrid, setLayout])
}
