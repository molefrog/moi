import type { ReactNode } from 'react'

import { motion } from 'motion/react'

import { IconMinus, IconPlus } from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'

import { Button } from './ui/button'

type WidgetGridItemProps = {
  editing?: boolean
  hidden?: boolean
  onRemove?: () => void
  children?: ReactNode
}

export function WidgetGridItem({ editing, hidden, onRemove, children }: WidgetGridItemProps) {
  return (
    <motion.div
      variants={{
        idle: { rotate: 0 },
        wiggle: {
          rotate: [0.5, -0.5],
          transition: {
            rotate: { repeat: Infinity, repeatType: 'reverse', duration: 0.15, ease: 'easeInOut' }
          }
        }
      }}
      animate={editing ? 'wiggle' : 'idle'}
      transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
      className="group/widget relative flex size-full flex-col"
    >
      <div
        className={cn(
          'dark flex flex-1 flex-col overflow-clip rounded-2xl shadow-sm [corner-shape:superellipse(1.2)]',
          'bg-background text-foreground',
          editing && 'pointer-events-none'
        )}
      >
        {children}
      </div>

      {editing && onRemove && (
        <div className="absolute -right-2 -top-2 opacity-0 transition-opacity group-hover/widget:opacity-100">
          <Button
            size="icon-sm"
            variant="outline"
            className="size-7 rounded-full"
            onClick={onRemove}
          >
            {hidden ? <IconPlus stroke={1.5} /> : <IconMinus stroke={1.5} />}
          </Button>
        </div>
      )}
    </motion.div>
  )
}
