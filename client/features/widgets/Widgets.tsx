import { useCallback, useRef, useState } from 'react'

import { AnimatePresence, LayoutGroup, motion } from 'motion/react'

import { IconPlus } from '@tabler/icons-react'

import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { findFreePosition } from '@/client/features/widgets/grid'
import type { GridItem } from '@/client/features/widgets/grid'
import { WidgetShell } from '@/client/features/applets/WidgetShell'
import { Button } from '@/client/components/ui/button'
import { Skeleton } from '@/client/components/ui/skeleton'
import { cn } from '@/client/lib/cn'
import type { WidgetInfo } from '@/lib/types'

import { HiddenPanel } from './HiddenPanel'
import { WidgetGrid, WidgetGridLayout } from './WidgetGrid'
import { useWidgetThumbnails } from './useWidgetThumbnails'

function renderItem(id: string) {
  return <WidgetShell name={id} />
}

const EMPTY_WIDGET_ITEMS: GridItem[] = Array.from({ length: 10 }, (_, index) => ({
  id: `empty-widget-${index}`,
  w: 2,
  h: 1
}))

function renderEmptyWidget() {
  return (
    <Skeleton className="size-full animate-none rounded-2xl [corner-shape:superellipse(1.2)]" />
  )
}

type NoWidgetsCreatedProps = {
  onCreateWidget: () => void
}

function NoWidgetsCreated({ onCreateWidget }: NoWidgetsCreatedProps) {
  return (
    <div className="relative min-h-0 flex-1 pt-7">
      <div aria-hidden="true">
        <WidgetGridLayout items={EMPTY_WIDGET_ITEMS} renderItem={renderEmptyWidget} />
      </div>

      <div className="absolute inset-0 z-1 flex items-center justify-center p-6">
        <div className="flex h-full w-full max-w-(--column-w) flex-col items-center justify-center gap-4 bg-radial from-background from-50% to-transparent to-75% text-center">
          <div className="flex flex-col gap-1.5">
            <h2 className="font-medium">A little empty here</h2>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              Widgets are small apps that can read data, perform tasks, and show a compact view of
              the information that matters.
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onCreateWidget}>
            <IconPlus data-icon="inline-start" stroke={1.5} />
            Create widget
          </Button>
        </div>
      </div>
    </div>
  )
}

type WidgetActionsProps = {
  editing: boolean
  onCreateWidget: () => void
  onEditingChange: (editing: boolean) => void
}

function WidgetActions({ editing, onCreateWidget, onEditingChange }: WidgetActionsProps) {
  return (
    <div className="mx-auto mb-4 flex w-full max-w-(--column-w) shrink-0 items-center justify-end gap-2">
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
  const hasWidgets = widgets.length > 0

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

  const containerRef = useRef<HTMLDivElement>(null)
  useWidgetThumbnails({
    containerRef,
    widgets,
    visibleIds: visibleItems.map(item => item.id),
    editing
  })

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

  return (
    // Shared working area below the header and positioning context for the
    // bottom panel. Created-widget states scroll; the initial empty state clips
    // its fixed-height skeleton grid.
    <div ref={containerRef} className="group/widgets relative min-h-0 flex-1">
      <LayoutGroup>
        <div
          className={cn(
            'relative flex h-full flex-col p-4',
            hasWidgets ? 'overflow-y-auto' : 'overflow-hidden'
          )}
        >
          {hasWidgets ? (
            <>
              <WidgetActions
                editing={editing}
                onCreateWidget={onCreateWidget}
                onEditingChange={onEditingChange}
              />
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
            </>
          ) : (
            <NoWidgetsCreated onCreateWidget={onCreateWidget} />
          )}
        </div>

        <AnimatePresence>
          {hasWidgets && editing && hiddenItems.length > 0 && (
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
