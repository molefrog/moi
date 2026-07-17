import { AnimatePresence, motion } from 'motion/react'

import { AppletMount } from '@/client/features/applets/AppletMount'
import { useWidget } from '@/client/features/applets/useApplet'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'

import { WidgetErrorBoundary } from './WidgetErrorBoundary'

type WidgetShellProps = {
  name: string
}

export function WidgetShell({ name }: WidgetShellProps) {
  const workspaceId = useWorkspaceId()
  const widget = useWidget(name)

  return (
    <AnimatePresence mode="wait" initial={false}>
      {widget.status === 'ready' && (
        <motion.div
          key={widget.version}
          className="absolute inset-0"
          initial={{ opacity: 0, filter: 'blur(4px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, filter: 'blur(4px)' }}
          transition={{ duration: 0.45, ease: 'easeInOut' }}
        >
          <WidgetErrorBoundary
            name={name}
            kind="widget"
            workspaceId={workspaceId}
            resetKey={widget.version}
          >
            <AppletMount segment="widgets" name={name} version={widget.version}>
              <widget.Component />
            </AppletMount>
          </WidgetErrorBoundary>
        </motion.div>
      )}
      {widget.status === 'error' && (
        <motion.p
          key={`err-${widget.version}`}
          className="absolute inset-0 p-4 text-xs text-destructive"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: 'easeInOut' }}
        >
          {widget.error}
        </motion.p>
      )}
    </AnimatePresence>
  )
}
