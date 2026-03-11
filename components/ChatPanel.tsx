import React, { useEffect } from 'react'

import {
  IconCheck,
  IconChevronsRight,
  IconLayoutSidebarRightFilled,
  IconPictureInPictureFilled,
  IconX
} from '@tabler/icons-react'

import { useScrollFade } from '../hooks/useScrollFade'
import type { ChatMessage } from '../lib/types'
import { cn } from '../lib/cn'
import { ChatInput } from './ChatInput'
import { EmptyState, MessageBlock, ThinkingIndicator } from './MessageBlock'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

export type LayoutMode = 'centered' | 'sidebar' | 'popup'

type ChatPanelProps = {
  messages: ChatMessage[]
  input: string
  setInput: (v: string) => void
  processing: boolean
  send: () => void
  stop: () => void
  layoutMode: LayoutMode
  onModeChange?: (mode: 'sidebar' | 'floating') => void
  onCollapse?: () => void
  onClose?: () => void
}

export function ChatPanel({
  messages,
  input,
  setInput,
  processing,
  send,
  stop,
  layoutMode,
  onModeChange,
  onCollapse,
  onClose
}: ChatPanelProps) {
  const { ref: scrollRef, showTopFade, showBottomFade } = useScrollFade()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'instant' })
  }, [messages])

  const isCentered = layoutMode === 'centered'

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between pb-2 pl-2">
        <h1 className="text-sm font-medium">New workspace</h1>
        <div className="flex items-center gap-0.5">
          {onModeChange && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label="Change layout mode">
                    {layoutMode === 'sidebar' ? (
                      <IconLayoutSidebarRightFilled className="text-muted-foreground" />
                    ) : (
                      <IconPictureInPictureFilled className="text-muted-foreground" />
                    )}
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onModeChange('sidebar')}>
                  <IconLayoutSidebarRightFilled size={16} />
                  Sidebar
                  {layoutMode === 'sidebar' && <IconCheck size={16} className="ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onModeChange('floating')}>
                  <IconPictureInPictureFilled size={16} />
                  Floating
                  {layoutMode !== 'sidebar' && <IconCheck size={16} className="ml-auto" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {layoutMode === 'sidebar' && onCollapse && (
            <Button variant="ghost" size="icon" onClick={onCollapse} aria-label="Collapse chat">
              <IconChevronsRight className="text-muted-foreground" />
            </Button>
          )}
          {layoutMode === 'popup' && onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close chat">
              <IconX className="text-muted-foreground" />
            </Button>
          )}
        </div>
      </header>

      <div
        ref={scrollRef}
        className={cn(
          'flex flex-1 flex-col gap-4 overflow-y-auto px-2 pt-4 pb-12',
          showTopFade && showBottomFade && 'mask-fade-y',
          showTopFade && !showBottomFade && 'mask-fade-top',
          !showTopFade && showBottomFade && 'mask-fade-bottom'
        )}
      >
        {messages.length === 0 && !processing && <EmptyState />}
        {messages.map((msg, i) => (
          <MessageBlock key={i} msg={msg} compact={!isCentered} />
        ))}
        {processing && <ThinkingIndicator />}
      </div>

      <ChatInput
        value={input}
        onChange={setInput}
        onSend={send}
        onStop={stop}
        processing={processing}
      />
    </div>
  )
}
