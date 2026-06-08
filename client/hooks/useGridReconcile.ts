import { useEffect, useRef } from 'react'

import { findFreePosition } from '@/client/lib/grid-pack'
import type { WidgetInfo, WorkspaceLayout } from '@/lib/types'

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
    const sizes = new Map(widgets.map(w => [w.id, { w: w.config.colSpan, h: w.config.rowSpan }]))

    // First sight of this workspace's widgets — trust the saved grid, move nothing.
    if (baseline.current?.workspaceId !== workspaceId) {
      baseline.current = { workspaceId, sizes }
      return
    }

    const prev = baseline.current.sizes
    const gridIds = new Set(layout.widgetGrid.map(g => g.i))
    const needsPositioning = widgets.filter(w => {
      const known = prev.has(w.id)
      if (!known) return !gridIds.has(w.id) // new widget with no slot → place it
      if (!gridIds.has(w.id)) return false // known + hidden by the user → leave it hidden
      const p = prev.get(w.id)! // visible → re-pack only if its size changed
      return p.w !== w.config.colSpan || p.h !== w.config.rowSpan
    })

    baseline.current = { workspaceId, sizes }
    if (needsPositioning.length === 0) return

    // Keep untouched widgets where they are; reconstruct w/h from config for
    // overlap detection, then pack the ones that need a (new) position.
    const newConfig = new Map(widgets.map(w => [w.id, w.config]))
    const kept = layout.widgetGrid
      .filter(g => !needsPositioning.some(w => w.id === g.i) && newConfig.has(g.i))
      .map(g => {
        const c = newConfig.get(g.i)!
        return { i: g.i, x: g.x, y: g.y, w: c.colSpan, h: c.rowSpan }
      })

    const grid = kept.map(({ i, x, y }) => ({ i, x, y }))
    const placed = [...kept]
    for (const w of needsPositioning) {
      const pos = findFreePosition(placed, w.config.colSpan, w.config.rowSpan, 4)
      grid.push({ i: w.id, x: pos.x, y: pos.y })
      placed.push({ i: w.id, x: pos.x, y: pos.y, w: w.config.colSpan, h: w.config.rowSpan })
    }

    setLayout({ widgetGrid: grid })
  }, [workspaceId, widgets, layout.widgetGrid, setLayout])
}
