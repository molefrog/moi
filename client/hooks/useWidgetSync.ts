import { findFreePosition } from '@/client/lib/grid-pack'
import { useWidgetsStore } from '@/client/store/widgets'
import { useWorkspaceStore } from '@/client/store/workspace'

import { useMeiEvent } from './useMeiEvents'

// Listens for widget-layout:updated events and keeps the grid in sync:
// - new widgets get a free position
// - widgets whose config size changed are re-packed at a new position
// - positions only (x,y) are stored; w/h always come from widget config
export function useWidgetSync() {
  useMeiEvent(e => {
    if (e.type !== 'widget-layout:updated') return

    const oldWidgets = useWidgetsStore.getState().widgets
    useWidgetsStore.setState({ widgets: e.widgets, status: 'ready' })

    const { layout, setLayout } = useWorkspaceStore.getState()
    const oldConfigMap = new Map(oldWidgets.map(w => [w.id, w.config]))
    const newConfigMap = new Map(e.widgets.map(w => [w.id, w.config]))
    const gridIds = new Set(layout.widgetGrid.map(g => g.i))

    // Widgets that need a new position: either new to the grid, or their size changed
    const needsPositioning = e.widgets.filter(w => {
      if (!gridIds.has(w.id)) return true
      const old = oldConfigMap.get(w.id)
      return !old || old.colSpan !== w.config.colSpan || old.rowSpan !== w.config.rowSpan
    })

    if (needsPositioning.length === 0) return

    // Keep unchanged widgets; reconstruct w/h from new config for overlap detection
    const kept = layout.widgetGrid
      .filter(g => !needsPositioning.some(w => w.id === g.i) && newConfigMap.has(g.i))
      .map(g => {
        const c = newConfigMap.get(g.i)!
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
  })
}
