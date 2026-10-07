import { useCallback, useRef, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'

import { motion } from 'motion/react'
import { Resizable } from 'react-resizable'

import { AgentBlobatar } from '@/client/components/shared/AgentBlobatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/client/components/ui/popover'
import { cn } from '@/client/lib/cn'
import { useUiStore } from '@/client/store/ui'
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
  const popupRef = useRef<HTMLDivElement>(null)
  const popupChatWidth = useUiStore(state => state.popupChatWidth)
  const setPopupChatWidth = useUiStore(state => state.setPopupChatWidth)
  const [size, setSize] = useState({ width: popupChatWidth, min: 0, max: popupChatWidth })

  const setPopupRef = useCallback(
    (popup: HTMLDivElement | null) => {
      popupRef.current = popup
      if (!popup) return
      popup.style.setProperty('--chat-popup-width', `${popupChatWidth}px`)
      // Report the rendered width, including viewport clamping of the saved preference.
      const observer = new ResizeObserver(([entry]) => {
        if (!entry) return
        const { minWidth, maxWidth } = getComputedStyle(popup)
        setSize({
          width: Math.round(entry.contentRect.width),
          min: parseFloat(minWidth),
          max: parseFloat(maxWidth)
        })
      })
      observer.observe(popup)
      return () => {
        observer.disconnect()
        popupRef.current = null
      }
    },
    [popupChatWidth]
  )

  const resize = (width: number) => {
    if (!popupRef.current) return
    const { minWidth, maxWidth } = getComputedStyle(popupRef.current)
    setPopupChatWidth(
      Math.round(Math.min(parseFloat(maxWidth), Math.max(parseFloat(minWidth), width)))
    )
  }
  const onClose = () => onOpenChange(false)
  const handleOpenChange: NonNullable<ComponentProps<typeof Popover>['onOpenChange']> = (
    nextOpen,
    eventDetails
  ) => {
    // Applet actions move focus outside before their click handler runs.
    // Keep chat open so adding context only refocuses the existing composer.
    if (
      !nextOpen &&
      (eventDetails.reason === 'outside-press' || eventDetails.reason === 'focus-out')
    ) {
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
          <div className="fixed right-3 bottom-3">
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
                className="group block cursor-pointer p-0 drop-shadow-[0_0_4px_var(--background)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label="Agent"
              >
                <AgentBlobatar
                  preset={agent}
                  color="primary"
                  animated={loading}
                  size={loading ? 80 : 64}
                  expression={loading ? 'thinking' : undefined}
                  className={cn(
                    'drop-shadow-md drop-shadow-primary/25',
                    'group-hover:drop-shadow-lg group-hover:drop-shadow-primary/40',
                    'transition-[width,height,filter] duration-300 ease-in-out motion-reduce:transition-none'
                  )}
                />
              </button>
            </motion.div>
          </div>
        }
      />
      <Resizable
        axis="x"
        width={size.width}
        height={0}
        resizeHandles={['w']}
        minConstraints={[size.min, 0]}
        maxConstraints={[size.max, 0]}
        onResize={(_event, { size }) => setPopupChatWidth(Math.round(size.width))}
        handle={
          <div
            role="separator"
            aria-label="Resize chat popup"
            aria-orientation="vertical"
            aria-valuemin={size.min}
            aria-valuemax={size.max}
            aria-valuenow={size.width}
            aria-valuetext={`${size.width} pixels wide`}
            tabIndex={0}
            className="absolute inset-y-6 -left-1 w-2 cursor-ew-resize touch-none rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onKeyDown={event => {
              const width = popupRef.current?.offsetWidth ?? popupChatWidth
              const step = event.shiftKey ? 32 : 16
              if (event.key === 'ArrowLeft') resize(width + step)
              else if (event.key === 'ArrowRight') resize(width - step)
              else if (event.key === 'Home') resize(-Infinity)
              else if (event.key === 'End') resize(Infinity)
              else return
              event.preventDefault()
            }}
          />
        }
      >
        <PopoverContent
          ref={setPopupRef}
          side="top"
          sideOffset={({ anchor }) => -anchor.height}
          align="end"
          className="relative flex h-[calc(100vh-2rem)] w-(--chat-popup-width) max-w-[calc(100vw-1.5rem)] min-w-[min(440px,calc(100vw-1.5rem))] flex-col gap-0 rounded-3xl p-0 transition-[opacity,transform] sm:h-[calc(100vh-8rem)]"
          keepMounted
        >
          {children(onClose)}
        </PopoverContent>
      </Resizable>
    </Popover>
  )
}
