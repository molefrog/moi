import type { ReactNode, RefObject } from 'react'
import { useState } from 'react'

import { motion } from 'motion/react'

import { IconRobotFace } from '@tabler/icons-react'

import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

type ChatPopupProps = {
  defaultOpen?: boolean
  // Portal target for the floating chat — pass the themed workspace wrapper so
  // the popup inherits its scoped CSS vars instead of landing on a bare body.
  container?: RefObject<HTMLElement | null>
  children: (onClose: () => void) => ReactNode
}

export function ChatPopup({ defaultOpen = false, container, children }: ChatPopupProps) {
  const [open, setOpen] = useState(defaultOpen)
  const onClose = () => setOpen(false)

  return (
    <Popover open={open} onOpenChange={o => setOpen(o)}>
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
              {/* Floating over a themed workspace — pin to white so it stays
                  legible regardless of the active theme's --background. */}
              <Button variant="outline" size="lg" className="bg-white hover:bg-white">
                <IconRobotFace stroke={1.75} /> Agent
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
        className="flex h-[calc(100vh-2rem)] w-[min(440px,calc(100vw-1rem))] flex-col gap-0 rounded-3xl p-3 sm:h-[calc(100vh-8rem)] sm:w-[min(440px,calc(100vw-2rem))] sm:p-4"
        keepMounted
        container={container}
      >
        {children(onClose)}
      </PopoverContent>
    </Popover>
  )
}
