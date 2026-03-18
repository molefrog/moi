import type { ReactNode } from 'react'
import { useState } from 'react'

import { IconMessage, IconX } from '@tabler/icons-react'

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
          <Button
            variant="outline"
            size="lg"
            className="fixed right-4 bottom-4 sm:right-6 sm:bottom-6"
          />
        }
      >
        {open ? (
          <IconX stroke={1.75} />
        ) : (
          <>
            <IconMessage stroke={1.75} /> Chat
          </>
        )}
      </PopoverTrigger>
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
