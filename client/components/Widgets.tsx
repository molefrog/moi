import { useState } from 'react'

import { AnimatePresence, LayoutGroup, motion } from 'motion/react'

import { useWidget } from '@/client/hooks/useWidget'
import { cn } from '@/client/lib/cn'
import { findFreePosition } from '@/client/lib/grid-pack'
import { useWidgetsStore } from '@/client/store/widgets'
import { useWorkspaceStore } from '@/client/store/workspace'

import { HiddenPanel } from './HiddenPanel'
import { WidgetErrorBoundary } from './WidgetErrorBoundary'
import type { GridItem } from './WidgetGrid'
import { WidgetGrid } from './WidgetGrid'
import { Button } from './ui/button'

function WidgetContent({ name }: { name: string }) {
  const widget = useWidget(name)
  if (widget.status === 'loading') return null
  if (widget.status === 'error')
    return <p className="text-destructive p-4 text-xs">{widget.error}</p>
  return (
    <WidgetErrorBoundary name={name} resetKey={widget.version}>
      <widget.Component />
    </WidgetErrorBoundary>
  )
}

function renderItem(id: string) {
  return <WidgetContent name={id} />
}

export function Widgets() {
  const { widgets } = useWidgetsStore()
  const { layout, setLayout } = useWorkspaceStore()
  const [editing, setEditing] = useState(false)

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
      <div className="group flex h-full flex-col">
        <header className="flex items-center justify-between pb-4">
          <h1 className="text-sm font-medium">Widgets</h1>
        </header>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground text-sm">No widgets found</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('group flex h-full flex-col')}>
      <header className="flex items-center justify-between pb-4">
        <h1 className="text-sm font-medium">Widgets</h1>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={editing ? 'done' : 'edit'}
            variants={{
              from: { opacity: 0, scale: 0.8, filter: 'blur(4px)' },
              to: { opacity: 1, scale: 1, filter: 'blur(0px)' }
            }}
            initial="from"
            animate="to"
            exit="from"
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
          >
            {editing ? (
              <Button onClick={() => setEditing(false)}>Done</Button>
            ) : (
              <Button
                variant="ghost"
                className="text-muted-foreground group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
                onClick={() => setEditing(true)}
              >
                Edit widgets
              </Button>
            )}
          </motion.div>
        </AnimatePresence>
      </header>

      <LayoutGroup>
        <div className="flex-1">
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
        </div>

        <AnimatePresence>
          {editing && hiddenItems.length > 0 && (
            <HiddenPanel items={hiddenItems} renderItem={renderItem} onRestore={restore} />
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
