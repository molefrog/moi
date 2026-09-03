import type { ReactNode } from 'react'

import { motion } from 'motion/react'

import { IconMinus, IconPlus } from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'

import { Button } from '@/client/components/ui/button'
import { useWorkspaceThemeSetting } from '@/client/features/workspace/WorkspaceLayoutContext'
import { getWorkspaceThemeStyle } from '@/client/runtime/workspace-theme'
import { isDefaultWidget } from '@/lib/default-widgets'

type WidgetFrameProps = {
  editing?: boolean
  hidden?: boolean
  widgetId?: string
  onRemove?: () => void
  children?: ReactNode
}

export function WidgetFrame({ editing, hidden, widgetId, onRemove, children }: WidgetFrameProps) {
  const theme = useWorkspaceThemeSetting()
  const vivid = !widgetId || !isDefaultWidget(widgetId)

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
        // Stable hook for widget thumbnails: the capture clone overrides this
        // element's chrome (radius/shadow/stroke) so thumbnails come out square.
        data-widget-chrome
        data-vivid={vivid ? true : undefined}
        style={vivid ? getWorkspaceThemeStyle(theme, 'widget') : undefined}
        className={cn(
          'absolute inset-0 overflow-hidden rounded-2xl text-foreground [corner-shape:superellipse(1.2)]',
          editing && 'pointer-events-none'
        )}
      >
        {children}
      </div>

      {editing && onRemove && (
        <div className="absolute -top-2 -right-2 opacity-0 transition-opacity group-hover/widget:opacity-100">
          <Button size="icon-sm" variant="outline" className="rounded-full" onClick={onRemove}>
            {hidden ? <IconPlus stroke={1.75} /> : <IconMinus stroke={1.75} />}
          </Button>
        </div>
      )}
    </motion.div>
  )
}
