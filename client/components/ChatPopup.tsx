import type { ReactNode, RefObject } from 'react'

import { motion } from 'motion/react'

import { IconRobotFace } from '@tabler/icons-react'

import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

type ChatPopupProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenChangeComplete: (open: boolean) => void
  // Portal target for the floating chat — pass the themed workspace wrapper so
  // the popup inherits its scoped CSS vars instead of landing on a bare body.
  container?: RefObject<HTMLElement | null>
  children: (onClose: () => void) => ReactNode
}

export function ChatPopup({
  open,
  onOpenChange,
  onOpenChangeComplete,
  container,
  children
}: ChatPopupProps) {
  const onClose = () => onOpenChange(false)

  return (
    <Popover open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
      <PopoverTrigger
        render={
          <div className="fixed right-4 bottom-4 sm:right-6 sm:bottom-6">
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
              {/* Floating over a themed workspace — use the card pair so it
                  stays legible regardless of the active theme background. */}
              <Button
                variant="outline"
                size="icon"
                className="bg-card text-card-foreground hover:bg-card"
                aria-label="Agent"
              >
                <IconRobotFace stroke={1.5} />
              </Button>
            </motion.div>
          </div>
        }
      />
      <PopoverContent
        side="top"
        sideOffset={-48}
        align="end"
        alignOffset={-8}
        className="flex h-[calc(100vh-2rem)] w-[min(440px,calc(100vw-1rem))] flex-col gap-0 rounded-3xl p-0 sm:h-[calc(100vh-8rem)] sm:w-[min(440px,calc(100vw-2rem))] sm:p-1"
        keepMounted
        container={container}
      >
        {children(onClose)}
      </PopoverContent>
    </Popover>
  )
}
