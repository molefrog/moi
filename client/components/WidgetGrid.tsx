import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'

import { motion } from 'motion/react'

import type { Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import ReactGridLayout, { WidthProvider } from 'react-grid-layout/legacy'
import 'react-resizable/css/styles.css'

import { packItems } from '@/client/lib/grid-pack'

import { WidgetGridItem } from './WidgetGridItem'

const GridLayout = WidthProvider(ReactGridLayout)

export type GridItem = {
  id: string
  w: number
  h: number
  x?: number
  y?: number
}

export type WidgetGridProps = {
  cols?: number
  rowHeight?: number
  gap?: number
  items: GridItem[]
  editing?: boolean
  renderItem: (id: string) => ReactNode
  onLayoutChange?: (items: GridItem[]) => void
  onRemove?: (id: string) => void
}

export function WidgetGrid({
  cols = 4,
  rowHeight = 160,
  gap = 16,
  items,
  editing,
  renderItem,
  onLayoutChange,
  onRemove
}: WidgetGridProps) {
  const [layout, setLayout] = useState<Layout>(() => packItems(items, []))
  const [prevItems, setPrevItems] = useState(items)

  // Sync layout synchronously during render (not useEffect) so layoutId animations
  // fire in the same React commit as the hidden panel unmount/mount
  if (prevItems !== items) {
    setPrevItems(items)
    setLayout(prev => {
      const ids = new Set(items.map(i => i.id))
      const kept = prev.filter(l => ids.has(l.i))
      const keptIds = new Set(kept.map(l => l.i))
      const added = packItems(
        items.filter(i => !keptIds.has(i.id)),
        kept
      )
      return [...kept, ...added]
    })
  }

  const handleLayoutChange = useCallback(
    (next: Layout) => {
      setLayout(next)
      onLayoutChange?.(
        next.map(item => ({ id: item.i, w: item.w, h: item.h, x: item.x, y: item.y }))
      )
    },
    [onLayoutChange]
  )

  return (
    <GridLayout
      measureBeforeMount
      cols={cols}
      rowHeight={rowHeight}
      margin={[gap, gap]}
      containerPadding={[0, 0]}
      layout={layout}
      isDraggable={editing}
      isResizable={false}
      compactType="vertical"
      onLayoutChange={handleLayoutChange}
    >
      {layout.map(item => (
        // Container div: purely structural, owned by RGL for positioning
        <div key={item.i}>
          <motion.div
            layoutId={item.i}
            className="size-full"
            transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
          >
            <WidgetGridItem
              editing={editing}
              onRemove={onRemove ? () => onRemove(item.i) : undefined}
            >
              {renderItem(item.i)}
            </WidgetGridItem>
          </motion.div>
        </div>
      ))}
    </GridLayout>
  )
}
