import type { ReactNode } from 'react'
import { useState } from 'react'

import { motion } from 'motion/react'

import { IconRobotFace } from '@tabler/icons-react'

import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

type ChatPopupProps = {
  children: (onClose: () => void) => ReactNode
}

export function ChatPopup({ children }: ChatPopupProps) {
  const [open, setOpen] = useState(false)
  const onClose = () => setOpen(false)

  return (
    <Popover open={open} onOpenChange={o => setOpen(o)}>
      <PopoverTrigger
        render={
          <motion.div
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6"
            variants={{
              from: { opacity: 0, scale: 0.8, filter: 'blur(4px)' },
              to: { opacity: 1, scale: 1, filter: 'blur(0px)' },
              invisible: { opacity: 0, scale: 1, filter: 'blur(4px)' }
            }}
            initial="from"
            animate={open ? 'invisible' : 'to'}
            transition={{ type: 'spring', duration: 0.2, delay: 0.3, bounce: 0 }}
          >
            <Button variant="outline" size="lg">
              <IconRobotFace /> Agent
            </Button>
          </motion.div>
        }
      />
      <PopoverContent
        side="top"
        sideOffset={-48}
        align="end"
        alignOffset={-8}
        className="flex h-[calc(100vh-32px)] w-[min(440px,calc(100vw-16px))] flex-col gap-0 rounded-3xl p-3 sm:h-[calc(100vh-96px)] sm:w-[min(440px,calc(100vw-32px))] sm:p-4"
        keepMounted
      >
        {children(onClose)}
      </PopoverContent>
    </Popover>
  )
}
