import type { ReactNode } from 'react'
import { useMemo } from 'react'

import { AnimatePresence, motion } from 'motion/react'

import { cn } from '@/client/lib/cn'
import { packItems } from '@/client/lib/grid-pack'

import { BottomPanel } from './BottomPanel'
import { WidgetFrame } from './WidgetFrame'
import type { GridItem } from './WidgetGrid'

// Static maps so Tailwind includes these classes (dynamic strings get purged)
const COL_START: Record<number, string> = {
  0: 'col-start-1',
  1: 'col-start-2',
  2: 'col-start-3',
  3: 'col-start-4'
}
const ROW_START: Record<number, string> = {
  0: 'row-start-1',
  1: 'row-start-2',
  2: 'row-start-3',
  3: 'row-start-4',
  4: 'row-start-5',
  5: 'row-start-6',
  6: 'row-start-7',
  7: 'row-start-8'
}
const COL_SPAN: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4'
}
const ROW_SPAN: Record<number, string> = {
  1: 'row-span-1',
  2: 'row-span-2',
  3: 'row-span-3',
  4: 'row-span-4'
}

type HiddenPanelProps = {
  items: GridItem[]
  renderItem: (id: string) => ReactNode
  onRestore: (id: string) => void
}

export function HiddenPanel({ items, renderItem, onRestore }: HiddenPanelProps) {
  const layout = useMemo(() => packItems(items), [items])

  return (
    <BottomPanel title="Hidden">
      {/* gap-4 + grid-cols-4 + [grid-auto-rows:160px] matches RGL's margin/rowHeight exactly */}
      <div className="grid grid-cols-4 gap-4 [grid-auto-rows:160px]">
        <AnimatePresence>
          {layout.map(item => (
            <motion.div
              key={item.i}
              layoutId={item.i}
              className={cn(
                COL_START[item.x],
                ROW_START[item.y],
                COL_SPAN[item.w],
                ROW_SPAN[item.h]
              )}
              transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
            >
              <WidgetFrame editing onRemove={() => onRestore(item.i)} hidden>
                {renderItem(item.i)}
              </WidgetFrame>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </BottomPanel>
  )
}
