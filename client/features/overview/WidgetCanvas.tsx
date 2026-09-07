import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'

import { motion } from 'motion/react'

import { GridLayout, type Layout, useContainerWidth, verticalCompactor } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

import { packItems } from './grid'
import type { GridPosition, PositionedGridItem } from './grid'
import { WidgetFrame } from './WidgetFrame'

const EMPTY_STATE_ID = 'moi:empty-state'
const WIDGET_LAYOUT_TRANSITION = { type: 'spring', duration: 0.35, bounce: 0 } as const

export type WidgetCanvasProps = {
  items: PositionedGridItem[]
  customizing?: boolean
  header: ReactNode
  emptyState?: ReactNode
  bottomInset?: number
  renderItem: (id: string) => ReactNode
  onMove?: (positions: GridPosition[]) => void
  onRemove?: (id: string) => void
}

type WidgetGridProps = {
  items: PositionedGridItem[]
  customizing?: boolean
  emptyState?: ReactNode
  renderItem: (id: string) => ReactNode
  onMove?: (positions: GridPosition[]) => void
  onRemove?: (id: string) => void
}

function WidgetGrid({
  items,
  customizing,
  emptyState,
  renderItem,
  onMove,
  onRemove
}: WidgetGridProps) {
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

  const gridLayout: Layout = emptyState
    ? [
        ...layout,
        {
          i: EMPTY_STATE_ID,
          x: 0,
          y: layout.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0),
          w: 4,
          h: 2,
          static: true
        }
      ]
    : layout

  const handleLayoutChange = useCallback(
    (next: Layout) => {
      const widgets = next.filter(item => item.i !== EMPTY_STATE_ID)
      setLayout(widgets)
      onMove?.(widgets.map(item => ({ id: item.i, x: item.x, y: item.y })))
    },
    [onMove]
  )

  return (
    <div ref={containerRef} className="w-full">
      {mounted && (
        <GridLayout
          width={width}
          layout={gridLayout}
          gridConfig={{ cols: 4, rowHeight: 160, margin: [8, 8], containerPadding: [0, 0] }}
          dragConfig={{ enabled: !!customizing }}
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
                transition={WIDGET_LAYOUT_TRANSITION}
              >
                <WidgetFrame
                  customizing={customizing}
                  widgetId={item.i}
                  onRemove={onRemove ? () => onRemove(item.i) : undefined}
                >
                  {renderItem(item.i)}
                </WidgetFrame>
              </motion.div>
            </div>
          ))}
          {emptyState && (
            <div key={EMPTY_STATE_ID}>
              <motion.div layout className="size-full" transition={WIDGET_LAYOUT_TRANSITION}>
                {emptyState}
              </motion.div>
            </div>
          )}
        </GridLayout>
      )}
    </div>
  )
}

export function WidgetCanvas({
  items,
  customizing,
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
        {(items.length > 0 || emptyState) && (
          <WidgetGrid
            items={items}
            customizing={customizing}
            emptyState={emptyState}
            renderItem={renderItem}
            onMove={onMove}
            onRemove={onRemove}
          />
        )}
      </motion.div>
    </div>
  )
}
