import { useCallback, useState } from 'react'

import { AnimatePresence, LayoutGroup, motion } from 'motion/react'

import { useWorkspaceLayoutCtx } from '@/client/lib/WorkspaceLayoutContext'
import { findFreePosition } from '@/client/lib/grid-pack'
import type { WidgetInfo } from '@/lib/types'

import { CustomizePanel } from './CustomizePanel'
import { HiddenPanel } from './HiddenPanel'
import type { GridItem } from './WidgetGrid'
import { WidgetGrid } from './WidgetGrid'
import { WidgetShell } from './WidgetShell'

export type WidgetMode = 'idle' | 'editing' | 'customizing'

function renderItem(id: string) {
  return <WidgetShell name={id} />
}

// Tracks the rendered (border-box) height of whichever bottom panel is open, so
// the grid can reserve matching space below it and every card stays reachable.
function usePanelHeight() {
  const [height, setHeight] = useState(0)
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const ro = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0]
      setHeight(box ? box.blockSize : entry.contentRect.height)
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [])
  return [ref, height] as const
}

type WidgetsProps = {
  // Owned by the page (its header renders the controls); Widgets only reacts.
  mode: WidgetMode
  // Authoritative widget set from the widgets query; positions come from layout.
  widgets: WidgetInfo[]
}

export function Widgets({ mode, widgets }: WidgetsProps) {
  const { layout, setLayout } = useWorkspaceLayoutCtx()

  const gridIds = new Set(layout.widgetGrid.map(g => g.i))

  const visibleItems: GridItem[] = layout.widgetGrid
    .filter(g => widgets.some(w => w.id === g.i))
    .map(g => {
      const widget = widgets.find(w => w.id === g.i)!
      return { id: g.i, w: widget.config.colSpan, h: widget.config.rowSpan, x: g.x, y: g.y }
    })

  const hiddenItems: GridItem[] = widgets
    .filter(w => !gridIds.has(w.id))
    .map(w => ({ id: w.id, w: w.config.colSpan, h: w.config.rowSpan }))

  const [panelRef, panelHeight] = usePanelHeight()
  const panelOpen = mode === 'customizing' || (mode === 'editing' && hiddenItems.length > 0)

  function hide(id: string) {
    setLayout({ widgetGrid: layout.widgetGrid.filter(g => g.i !== id) })
  }

  function restore(id: string) {
    const widget = widgets.find(w => w.id === id)
    if (!widget) return
    const gridWithSizes = layout.widgetGrid.map(g => {
      const w = widgets.find(w => w.id === g.i)
      return { ...g, w: w?.config.colSpan ?? 1, h: w?.config.rowSpan ?? 1 }
    })
    const pos = findFreePosition(gridWithSizes, widget.config.colSpan, widget.config.rowSpan, 4)
    setLayout({ widgetGrid: [...layout.widgetGrid, { i: id, x: pos.x, y: pos.y }] })
  }

  if (widgets.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">No widgets found</p>
      </div>
    )
  }

  return (
    // Working area: everything below the header. It scrolls, and it's the
    // positioning context for the bottom panel (which is anchored to this box,
    // not to the grid). The grid lives in a centered max-w container and grows
    // to its natural height.
    <div className="relative min-h-0 flex-1">
      <LayoutGroup>
        <div className="h-full overflow-y-auto px-[var(--page-pad)] pt-[var(--page-pad)] pb-[calc(var(--page-pad)*2)]">
          {/* Bottom reservation = 2× page-pad (the pb above) + the open panel's
              height (this margin), so the last cards scroll clear of it. */}
          <motion.div
            className="mx-auto w-full max-w-[var(--column-w)]"
            animate={{ marginBottom: panelOpen ? panelHeight : 0 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
          >
            <WidgetGrid
              items={visibleItems}
              editing={mode === 'editing'}
              renderItem={renderItem}
              onRemove={hide}
              onLayoutChange={items =>
                setLayout({
                  widgetGrid: items.map(i => ({ i: i.id, x: i.x ?? 0, y: i.y ?? 0 }))
                })
              }
            />
          </motion.div>
        </div>

        <AnimatePresence>
          {mode === 'editing' && hiddenItems.length > 0 && (
            <HiddenPanel
              ref={panelRef}
              items={hiddenItems}
              renderItem={renderItem}
              onRestore={restore}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {mode === 'customizing' && <CustomizePanel ref={panelRef} />}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
