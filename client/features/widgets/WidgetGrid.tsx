import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'

import { motion } from 'motion/react'

import { GridLayout, type Layout, useContainerWidth, verticalCompactor } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

import { packItems } from '@/client/features/widgets/grid'
import type { GridItem } from '@/client/features/widgets/grid'

import { WidgetFrame } from './WidgetFrame'

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
  gap = 8,
  items,
  editing,
  renderItem,
  onLayoutChange,
  onRemove
}: WidgetGridProps) {
  const [layout, setLayout] = useState<Layout>(() => packItems(items, []))
  const [prevItems, setPrevItems] = useState(items)

  // v2 replaces the WidthProvider HOC with this hook. `measureBeforeMount` holds
  // the grid back until the container is measured, so it never flashes at the
  // wrong width; `containerRef` goes on the wrapper, `width` feeds the grid.
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true })

  // Sync layout synchronously during render (not useEffect) so layoutId animations
  // fire in the same React commit as the hidden panel unmount/mount
  if (prevItems !== items) {
    setPrevItems(items)
    setLayout(prev => {
      const prevMap = new Map(prev.map(l => [l.i, l]))
      // Preserve x/y from RGL state but always take w/h from items (source of truth)
      const kept = items
        .filter(i => prevMap.has(i.id))
        .map(i => ({ ...prevMap.get(i.id)!, w: i.w, h: i.h }))
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
    <div ref={containerRef}>
      {mounted && (
        <GridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols, rowHeight, margin: [gap, gap], containerPadding: [0, 0] }}
          dragConfig={{ enabled: !!editing }}
          resizeConfig={{ enabled: false }}
          compactor={verticalCompactor}
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
                <WidgetFrame
                  editing={editing}
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
