import { useCallback, useState } from 'react'

import { AnimatePresence, LayoutGroup, motion } from 'motion/react'

import { IconPlus } from '@tabler/icons-react'

import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { findFreePosition } from '@/client/features/widgets/grid'
import type { GridItem } from '@/client/features/widgets/grid'
import { WidgetShell } from '@/client/features/applets/WidgetShell'
import { Button } from '@/client/components/ui/button'
import type { WidgetInfo } from '@/lib/types'

import { HiddenPanel } from './HiddenPanel'
import { WidgetGrid } from './WidgetGrid'

function renderItem(id: string) {
  return <WidgetShell name={id} />
}

type NoWidgetsCreatedProps = {
  onCreateWidget: () => void
}

function NoWidgetsCreated({ onCreateWidget }: NoWidgetsCreatedProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
      <p className="text-sm text-muted-foreground">No widgets created yet</p>
      <Button type="button" variant="secondary" size="sm" onClick={onCreateWidget}>
        <IconPlus data-icon="inline-start" stroke={1.75} />
        Create widget
      </Button>
    </div>
  )
}

function NoWidgetsAdded() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
      <p className="text-sm text-muted-foreground">No widgets added yet</p>
    </div>
  )
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
  onCreateWidget: () => void
  editing: boolean
  onEditingChange: (editing: boolean) => void
  // Authoritative widget set from the widgets query; positions come from layout.
  widgets: WidgetInfo[]
}

export function Widgets({ onCreateWidget, editing, onEditingChange, widgets }: WidgetsProps) {
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
  const panelOpen = editing && hiddenItems.length > 0

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
    return <NoWidgetsCreated onCreateWidget={onCreateWidget} />
  }

  return (
    // Working area: everything below the header. It scrolls, and it's the
    // positioning context for the bottom panel (which is anchored to this box,
    // not to the grid). The grid lives in a centered max-w container and grows
    // to its natural height.
    <div className="group/widgets relative min-h-0 flex-1">
      <LayoutGroup>
        <div className="flex h-full flex-col overflow-y-auto p-4">
          <div className="mx-auto mb-4 flex w-full max-w-[var(--column-w)] shrink-0 items-center justify-end gap-2">
            {editing && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mr-auto"
                onClick={onCreateWidget}
              >
                <IconPlus data-icon="inline-start" stroke={1.75} />
                New widget
              </Button>
            )}
            <AnimatePresence mode="popLayout" initial={false}>
              {editing ? (
                <motion.div
                  key="done"
                  variants={{
                    from: { opacity: 0, scale: 0.8, filter: 'blur(4px)' },
                    to: { opacity: 1, scale: 1, filter: 'blur(0px)' }
                  }}
                  initial="from"
                  animate="to"
                  exit="from"
                  transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
                >
                  <Button type="button" size="sm" onClick={() => onEditingChange(false)}>
                    Done
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="actions"
                  className="flex items-center gap-1"
                  variants={{
                    from: { opacity: 0, scale: 0.8, filter: 'blur(4px)' },
                    to: { opacity: 1, scale: 1, filter: 'blur(0px)' }
                  }}
                  initial="from"
                  animate="to"
                  exit="from"
                  transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground group-hover/widgets:opacity-100 [@media(hover:hover)]:opacity-0"
                    onClick={() => onEditingChange(true)}
                  >
                    Edit widgets
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {visibleItems.length === 0 ? (
            <motion.div
              className="mx-auto flex min-h-0 w-full max-w-[var(--column-w)] flex-1 flex-col"
              animate={{ paddingBottom: panelOpen ? panelHeight : 0 }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
            >
              <NoWidgetsAdded />
            </motion.div>
          ) : (
            // The open panel's height is reserved below the grid so every card
            // can scroll clear of the panel.
            <motion.div
              className="mx-auto w-full max-w-[var(--column-w)]"
              animate={{ marginBottom: panelOpen ? panelHeight : 0 }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
            >
              <WidgetGrid
                items={visibleItems}
                editing={editing}
                renderItem={renderItem}
                onRemove={hide}
                onLayoutChange={items =>
                  setLayout({
                    widgetGrid: items.map(i => ({ i: i.id, x: i.x ?? 0, y: i.y ?? 0 }))
                  })
                }
              />
            </motion.div>
          )}
        </div>

        <AnimatePresence>
          {editing && hiddenItems.length > 0 && (
            <HiddenPanel
              ref={panelRef}
              items={hiddenItems}
              renderItem={renderItem}
              onRestore={restore}
            />
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
