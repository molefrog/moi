import { useState } from 'react'

import { AnimatePresence, LayoutGroup, motion } from 'motion/react'

import { useWidget } from '@/client/hooks/useWidget'
import { useWidgetList } from '@/client/hooks/useWidgetList'
import { cn } from '@/client/lib/cn'

import { HiddenPanel } from './HiddenPanel'
import { SpaceName } from './SpaceName'
import type { GridItem } from './WidgetGrid'
import { WidgetGrid } from './WidgetGrid'
import { Button } from './ui/button'

function WidgetContent({ name }: { name: string }) {
  const widget = useWidget(name)
  if (widget.status === 'loading') return null
  if (widget.status === 'error')
    return <p className="text-destructive p-4 text-xs">{widget.error}</p>
  return <widget.Component />
}

function renderItem(id: string) {
  return <WidgetContent name={id} />
}

export function Widgets() {
  const widgetList = useWidgetList()
  const [editing, setEditing] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const allItems: GridItem[] = widgetList.map(({ id, config }) => ({
    id,
    w: config.colSpan,
    h: config.rowSpan
  }))

  const visibleItems = allItems.filter(i => !hiddenIds.has(i.id))
  const hiddenItems = allItems.filter(i => hiddenIds.has(i.id))

  function hide(id: string) {
    setHiddenIds(prev => new Set([...prev, id]))
  }

  function restore(id: string) {
    setHiddenIds(prev => {
      const s = new Set(prev)
      s.delete(id)
      return s
    })
  }

  if (allItems.length === 0) {
    return (
      <div className="group flex h-full flex-col">
        <header className="flex items-center justify-between pb-4">
          <SpaceName />
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
        <SpaceName />
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
