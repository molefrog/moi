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
          'dark absolute inset-0 overflow-hidden rounded-2xl [corner-shape:superellipse(1.2)]',
          // Outer drop shadow stays as before; the 1px stroke moves to
          // `inset` so it sits OVER the widget content. On colored widgets
          // (yellow bg, etc.) the corner pixel becomes content + 8% black
          // instead of an unrelated gray ring around the box.
          'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.08),0_2px_4px_0_rgba(0,0,0,0.06)]',
          'text-foreground',
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
