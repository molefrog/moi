import type { ComponentProps, ReactNode } from 'react'

import { motion } from 'motion/react'

import { AgentBlobatar } from '@/client/components/shared/AgentBlobatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/client/components/ui/popover'
import { cn } from '@/client/lib/cn'
import type { AgentTheme } from '@/lib/types'

type ChatPopupProps = {
  agent: AgentTheme
  loading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenChangeComplete: (open: boolean) => void
  children: (onClose: () => void) => ReactNode
}

export function ChatPopup({
  agent,
  loading,
  open,
  onOpenChange,
  onOpenChangeComplete,
  children
}: ChatPopupProps) {
  const onClose = () => onOpenChange(false)
  const handleOpenChange: NonNullable<ComponentProps<typeof Popover>['onOpenChange']> = (
    nextOpen,
    eventDetails
  ) => {
    if (!nextOpen && eventDetails.reason === 'outside-press') {
      eventDetails.cancel()
      return
    }
    onOpenChange(nextOpen)
  }

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      {/* Floating over a themed workspace — use the card pair so it stays
          legible regardless of the active theme background. */}
      <PopoverTrigger
        render={
          <div className="fixed right-4 bottom-4 sm:right-4 sm:bottom-4">
            <motion.div
              variants={{
                from: { opacity: 0, scale: 0.8, filter: 'blur(4px)' },
                to: { opacity: 1, scale: 1, filter: 'blur(0px)' },
                invisible: { opacity: 0, scale: 1, filter: 'blur(4px)' }
              }}
              initial="from"
              animate={open ? 'invisible' : 'to'}
              transition={{ type: 'spring', duration: 0.3, delay: 0.2, bounce: 0 }}
            >
              <button
                type="button"
                className="group block cursor-pointer rounded-xl p-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label="Agent"
              >
                <AgentBlobatar
                  preset={agent}
                  color="primary"
                  size={56}
                  animated={loading}
                  className={cn(
                    'drop-shadow-md drop-shadow-primary/30',
                    'group-hover:drop-shadow-lg group-hover:drop-shadow-primary/40',
                    'transition-[filter] duration-400 ease-in-out motion-reduce:transition-none'
                  )}
                />
              </button>
            </motion.div>
          </div>
        }
      />
      <PopoverContent
        positionMethod="fixed"
        side="top"
        sideOffset={-56}
        align="end"
        className="flex h-[calc(100vh-2rem)] w-[min(440px,calc(100vw-1rem))] flex-col gap-0 rounded-3xl p-0 sm:h-[calc(100vh-8rem)] sm:w-[min(440px,calc(100vw-2rem))] sm:p-1"
        keepMounted
      >
        {children(onClose)}
      </PopoverContent>
    </Popover>
  )
}
