import type { CSSProperties } from 'react'
import { useState } from 'react'

import { AnimatePresence, LayoutGroup, motion } from 'motion/react'

import { IconMinus, IconPencil, IconPlus } from '@tabler/icons-react'

import { useWidget } from '@/client/hooks/useWidget'
import { useWidgetList } from '@/client/hooks/useWidgetList'
import { cn } from '@/client/lib/cn'

import { SpaceName } from './SpaceName'
import { Button } from './ui/button'

type WidgetPosition = {
  row?: number
  rowSpan: 1 | 2 | 3 | 4
  col?: number
  colSpan: 1 | 2 | 3 | 4
}

type WidgetContentProps = {
  name: string
}

function WidgetContent({ name }: WidgetContentProps) {
  const widget = useWidget(name)

  if (widget.status === 'loading') {
    return <p className="text-muted-foreground text-xs">Loading...</p>
  }

  if (widget.status === 'error') {
    return <p className="text-destructive text-xs">{widget.error}</p>
  }

  return <widget.Component />
}

type WidgetCardProps = {
  name: string
  position: WidgetPosition
  hidden?: boolean
  editing: boolean
  onToggle: (name: string) => void
}

function WidgetCard({ name, position, hidden, editing, onToggle }: WidgetCardProps) {
  const styles: CSSProperties = {
    gridRow: `span ${position.rowSpan}`,
    gridColumn: `span ${position.colSpan}`
  }

  return (
    <motion.div
      key={name}
      layoutId={name}
      variants={{
        idle: {
          rotate: 0
        },
        wiggle: {
          rotate: [0.5, -0.5],
          transition: {
            rotate: { repeat: Infinity, repeatType: 'reverse', duration: 0.15, ease: 'easeInOut' }
          }
        }
      }}
      animate={editing ? 'wiggle' : 'idle'}
      transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
      className={cn('group/widget relative flex', hidden && 'cursor-pointer')}
      style={styles}
      onClick={hidden ? () => onToggle(name) : undefined}
    >
      <div className="flex flex-1 items-center justify-center overflow-clip rounded-2xl shadow-sm [corner-shape:superellipse(1.2)]">
        <WidgetContent name={name} />
      </div>
      {editing && (
        <div className="absolute -right-2 -top-2 flex gap-1 opacity-0 transition-opacity group-hover/widget:opacity-100">
          {!hidden && (
            <Button
              size="icon-sm"
              variant="outline"
              className="size-7 rounded-full"
              onClick={() => {}}
            >
              <IconPencil stroke={1.5} />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="outline"
            className="size-7 rounded-full"
            onClick={
              hidden
                ? e => {
                    e.stopPropagation()
                    onToggle(name)
                  }
                : () => onToggle(name)
            }
          >
            {hidden ? <IconPlus stroke={1.5} /> : <IconMinus stroke={1.5} />}
          </Button>
        </div>
      )}
    </motion.div>
  )
}

export function Widgets() {
  const widgetNames = useWidgetList()
  const [editing, setEditing] = useState(false)
  const [hiddenSet, setHiddenSet] = useState<Set<string>>(new Set())

  function toggleWidget(name: string) {
    setHiddenSet(prev => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const visibleWidgets = widgetNames.filter(name => !hiddenSet.has(name))
  const hiddenWidgets = widgetNames.filter(name => hiddenSet.has(name))

  if (widgetNames.length === 0) {
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
    <div className="group flex h-full flex-col">
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
        <motion.div layout className="grid flex-1 auto-rows-[136px] grid-cols-4 gap-4">
          {visibleWidgets.map(name => (
            <WidgetCard
              key={name}
              name={name}
              position={{ rowSpan: 1, colSpan: 4 }}
              editing={editing}
              onToggle={toggleWidget}
            />
          ))}
        </motion.div>

        <AnimatePresence>
          {editing && hiddenWidgets.length > 0 && (
            <motion.div
              className="-m-8 mt-20 rounded-t-2xl p-8 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04),inset_0_2px_4px_-1px_rgba(0,0,0,0.06),inset_0_4px_16px_-4px_rgba(0,0,0,0.06)]"
              variants={{
                from: { opacity: 0, y: 40, filter: 'blur(4px)' },
                to: { opacity: 1, y: 0, filter: 'blur(0px)' }
              }}
              initial="from"
              animate="to"
              exit="from"
              transition={{ type: 'spring', duration: 0.2, bounce: 0 }}
            >
              <p className="text-muted-foreground mb-4 text-sm font-medium">Hidden</p>
              <div className="grid grid-cols-4 gap-4">
                {hiddenWidgets.map(name => (
                  <WidgetCard
                    key={name}
                    name={name}
                    position={{ rowSpan: 1, colSpan: 2 }}
                    hidden
                    editing={editing}
                    onToggle={toggleWidget}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
