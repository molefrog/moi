import type { ReactNode } from 'react'

import { motion } from 'motion/react'

import { IconMinus, IconPlus } from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'

import { Button } from './ui/button'

type WidgetFrameProps = {
  editing?: boolean
  hidden?: boolean
  onRemove?: () => void
  children?: ReactNode
}

export function WidgetFrame({ editing, hidden, onRemove, children }: WidgetFrameProps) {
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
      className="group/widget relative size-full"
    >
      <div
        className={cn(
          'dark absolute inset-0 overflow-hidden rounded-2xl shadow-sm [corner-shape:superellipse(1.2)]',
          'bg-muted text-foreground',
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
