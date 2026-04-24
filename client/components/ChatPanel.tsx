import { useEffect } from 'react'

import { IconChevronsRight, IconSelector, IconX } from '@tabler/icons-react'

import { useScrollFade } from '@/client/hooks/useScrollFade'
import { cn } from '@/client/lib/cn'
import type { ChatMessage } from '@/lib/types'

import { ChatInput } from './ChatInput'
import { EmptyState, MessageBlock, ThinkingIndicator } from './MessageBlock'
import { ThreadSelector } from './ThreadSelector'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

export type ChatMode = 'solo' | 'sidebar' | 'floating'

type ChatModeIconProps = {
  className?: string
}

function ChatModeIconSidebar({ className }: ChatModeIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.5"
      className={className}
    >
      <rect x="1.75" y="3.75" width="20.5" height="16.5" rx="2.25" stroke="currentColor" />
      <rect x="11.5" y="5.5" width="9" height="13" rx="1" fill="currentColor" />
    </svg>
  )
}

function ChatModeIconFloating({ className }: ChatModeIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.5"
      className={className}
    >
      <rect x="1.75" y="3.75" width="20.5" height="16.5" rx="2.25" stroke="currentColor" />
      <rect x="12.5" y="11.5" width="8" height="7" rx="1" fill="currentColor" />
    </svg>
  )
}

type ChatPanelProps = {
  messages: ChatMessage[]
  input: string
  setInput: (v: string) => void
  processing: boolean
  send: () => void
  stop: () => void
  chatMode: ChatMode
  onSwitchThread: (sessionId: string | null) => void
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
  chatMode,
  onSwitchThread,
  onModeChange,
  onCollapse,
  onClose
}: ChatPanelProps) {
  const { ref: scrollRef, showTopFade, showBottomFade } = useScrollFade()

  useEffect(() => {
    const ref = chatMode === 'solo' ? document.body : scrollRef.current

    ref?.scrollTo({ top: ref.scrollHeight, behavior: 'instant' })
  }, [scrollRef, messages, chatMode])

  const TriggerIcon = chatMode === 'sidebar' ? ChatModeIconSidebar : ChatModeIconFloating

  return (
    <div className={cn('flex flex-col', chatMode === 'solo' ? 'min-h-full' : 'h-full')}>
      <header
        className={cn(
          'flex items-center justify-between pb-2 pl-2',
          chatMode === 'solo' &&
            'bg-background sticky top-0 mt-[calc(var(--page-pad)*-1)] pt-[var(--page-pad)]'
        )}
      >
        <ThreadSelector onSwitch={onSwitchThread} />
        <div className="flex items-center gap-0.5">
          {chatMode !== 'solo' && onModeChange && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    className="pl-2! pr-1! gap-0"
                    variant="ghost"
                    aria-label="Switch chat mode"
                  >
                    <>
                      <TriggerIcon className="text-muted-foreground" />
                      <IconSelector className="size-4! text-muted-foreground/50" stroke={2} />
                    </>
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuRadioGroup value={chatMode} onValueChange={onModeChange}>
                  <DropdownMenuRadioItem value="sidebar" closeOnClick>
                    <ChatModeIconSidebar />
                    Sidebar
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="floating" closeOnClick>
                    <ChatModeIconFloating />
                    Floating
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {chatMode === 'sidebar' && onCollapse && (
            <Button variant="ghost" size="icon" onClick={onCollapse} aria-label="Collapse chat">
              {/* Tabler icon with double chevrons has a really weird optical size, hence the adjustments */}
              <IconChevronsRight className="text-muted-foreground size-6!" stroke={1.5} />
            </Button>
          )}
          {chatMode === 'floating' && onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close chat">
              <IconX className="text-muted-foreground" stroke={1.5} />
            </Button>
          )}
        </div>
      </header>

      <div
        ref={chatMode !== 'solo' ? scrollRef : undefined}
        className={cn(
          'flex flex-1 flex-col gap-6 overscroll-contain px-2 pb-12 pt-4',
          chatMode !== 'solo' && 'overflow-y-auto',
          chatMode !== 'solo' && showTopFade && showBottomFade && 'mask-fade-y',
          chatMode !== 'solo' && showTopFade && !showBottomFade && 'mask-fade-top',
          chatMode !== 'solo' && !showTopFade && showBottomFade && 'mask-fade-bottom'
        )}
      >
        {messages.length === 0 && !processing && <EmptyState />}
        {messages.map((msg, i) => (
          <MessageBlock key={i} msg={msg} messages={messages} index={i} />
        ))}
        {processing && <ThinkingIndicator />}
      </div>

      <div
        className={cn(
          chatMode === 'solo' &&
            'bg-background sticky bottom-0 mb-[calc(var(--page-pad)*-1)] pb-[var(--page-pad)]'
        )}
      >
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={send}
          onStop={stop}
          processing={processing}
        />
      </div>
    </div>
  )
}
