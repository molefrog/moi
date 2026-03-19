import type { ReactNode } from 'react'
import { useState } from 'react'

import { AnimatePresence, LayoutGroup, motion } from 'motion/react'

import { IconMinus, IconPencil, IconPlus } from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'

import { SpaceName } from './SpaceName'
import { Button } from './ui/button'
import { ActivityWidget } from './widgets/ActivityWidget'
import { HeartRateWidget } from './widgets/HeartRateWidget'
import { SleepWidget } from './widgets/SleepWidget'
import { StepsWidget } from './widgets/StepsWidget'

type Widget = {
  id: string
  name: string
  colSpan: 2 | 1
  hidden: boolean
  content: ReactNode
}

type WidgetCardProps = {
  widget: Widget
  editing: boolean
  onToggle: (id: string) => void
}

function WidgetCard({ widget, editing, onToggle }: WidgetCardProps) {
  const isHidden = widget.hidden

  return (
    <motion.div
      key={widget.id}
      layoutId={widget.id}
      transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
      className={cn(
        'group/widget relative flex',
        widget.colSpan === 2 && 'col-span-2',
        isHidden && 'h-[136px] cursor-pointer'
      )}
      onClick={isHidden ? () => onToggle(widget.id) : undefined}
    >
      <div className="flex-1 overflow-clip rounded-2xl shadow-sm [corner-shape:superellipse(1.2)]">
        {widget.content}
      </div>
      {editing && (
        <div className="absolute -right-2 -top-2 flex gap-1 opacity-0 transition-opacity group-hover/widget:opacity-100">
          {!isHidden && (
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
              isHidden
                ? e => {
                    e.stopPropagation()
                    onToggle(widget.id)
                  }
                : () => onToggle(widget.id)
            }
          >
            {isHidden ? <IconPlus stroke={1.5} /> : <IconMinus stroke={1.5} />}
          </Button>
        </div>
      )}
    </motion.div>
  )
}

const initialWidgets: Widget[] = [
  {
    id: 'steps',
    name: 'Steps',
    colSpan: 2,
    hidden: false,
    content: <StepsWidget />
  },
  {
    id: 'heart-rate',
    name: 'Heart Rate',
    colSpan: 1,
    hidden: false,
    content: <HeartRateWidget />
  },
  {
    id: 'sleep',
    name: 'Sleep',
    colSpan: 1,
    hidden: false,
    content: <SleepWidget />
  },
  {
    id: 'activity',
    name: 'Activity',
    colSpan: 2,
    hidden: false,
    content: <ActivityWidget />
  }
]

export function Widgets() {
  const [editing, setEditing] = useState(false)
  const [widgets, setWidgets] = useState<Widget[]>(initialWidgets)

  const visibleWidgets = widgets.filter(w => !w.hidden)
  const hiddenWidgets = widgets.filter(w => w.hidden)

  function toggleWidget(id: string) {
    setWidgets(prev => {
      const widget = prev.find(w => w.id === id)
      if (!widget) return prev
      const toggled = { ...widget, hidden: !widget.hidden }
      return [...prev.filter(w => w.id !== id), toggled]
    })
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
        <motion.div layout className="grid flex-1 auto-rows-[136px] grid-cols-2 gap-4">
          {visibleWidgets.map(w => (
            <WidgetCard key={w.id} widget={w} editing={editing} onToggle={toggleWidget} />
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
              <div className="grid grid-cols-2 gap-4">
                {hiddenWidgets.map(w => (
                  <WidgetCard key={w.id} widget={w} editing={editing} onToggle={toggleWidget} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
