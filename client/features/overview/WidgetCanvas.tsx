import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'

import { motion } from 'motion/react'

import { GridLayout, type Layout, useContainerWidth, verticalCompactor } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

import { packItems } from './grid'
import type { GridPosition, PositionedGridItem } from './grid'
import { WidgetFrame } from './WidgetFrame'

export type WidgetCanvasProps = {
  items: PositionedGridItem[]
  editing?: boolean
  header: ReactNode
  emptyState?: ReactNode
  bottomInset?: number
  renderItem: (id: string) => ReactNode
  onMove?: (positions: GridPosition[]) => void
  onRemove?: (id: string) => void
}

type WidgetGridProps = {
  items: PositionedGridItem[]
  editing?: boolean
  renderItem: (id: string) => ReactNode
  onMove?: (positions: GridPosition[]) => void
  onRemove?: (id: string) => void
}

function WidgetGrid({ items, editing, renderItem, onMove, onRemove }: WidgetGridProps) {
  const [layout, setLayout] = useState<Layout>(() => packItems(items))
  const [previousItems, setPreviousItems] = useState(items)
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true })

  if (previousItems !== items) {
    setPreviousItems(items)
    setLayout(previous => {
      const previousById = new Map(previous.map(item => [item.i, item]))
      const kept = items
        .filter(item => previousById.has(item.id))
        .map(item => ({ ...previousById.get(item.id)!, w: item.w, h: item.h }))
      const keptIds = new Set(kept.map(item => item.i))
      return [
        ...kept,
        ...packItems(
          items.filter(item => !keptIds.has(item.id)),
          kept
        )
      ]
    })
  }

  const handleLayoutChange = useCallback(
    (next: Layout) => {
      setLayout(next)
      onMove?.(next.map(item => ({ id: item.i, x: item.x, y: item.y })))
    },
    [onMove]
  )

  return (
    <div ref={containerRef} className="w-full">
      {mounted && (
        <GridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols: 4, rowHeight: 160, margin: [8, 8], containerPadding: [0, 0] }}
          dragConfig={{ enabled: !!editing }}
          resizeConfig={{ enabled: false }}
          compactor={verticalCompactor}
          onLayoutChange={handleLayoutChange}
        >
          {layout.map(item => (
            <div key={item.i}>
              <motion.div
                layoutId={item.i}
                data-applet-thumbnail={`widget:${item.i}`}
                className="size-full"
                transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
              >
                <WidgetFrame
                  editing={editing}
                  widgetId={item.i}
                  onRemove={onRemove ? () => onRemove(item.i) : undefined}
                >
                  {renderItem(item.i)}
                </WidgetFrame>
              </motion.div>
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  )
}

export function WidgetCanvas({
  items,
  editing,
  header,
  emptyState,
  bottomInset = 0,
  renderItem,
  onMove,
  onRemove
}: WidgetCanvasProps) {
  return (
    <div className="size-full overflow-y-auto p-4">
      <div className="mx-auto h-32 w-full max-w-(--column-w)">{header}</div>
      <motion.div
        className="mx-auto flex min-h-0 w-full max-w-(--column-w) flex-col gap-2"
        animate={{ marginBottom: bottomInset }}
        transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
      >
        {items.length > 0 && (
          <WidgetGrid
            items={items}
            editing={editing}
            renderItem={renderItem}
            onMove={onMove}
            onRemove={onRemove}
          />
        )}
        {emptyState && <div className="h-[328px]">{emptyState}</div>}
      </motion.div>
    </div>
  )
}
