import { useEffect } from 'react'

import {
  IconChevronsRight,
  IconLayoutSidebarRightFilled,
  IconPictureInPictureFilled,
  IconSelector,
  IconX
} from '@tabler/icons-react'

import { useScrollFade } from '@/client/hooks/useScrollFade'
import { cn } from '@/client/lib/cn'
import type { ChatMessage } from '@/lib/types'

import { ChatInput } from './ChatInput'
import { EmptyState, MessageBlock, ThinkingIndicator } from './MessageBlock'
import { SpaceName } from './SpaceName'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

export type ChatMode = 'solo' | 'sidebar' | 'floating'

type ChatPanelProps = {
  messages: ChatMessage[]
  input: string
  setInput: (v: string) => void
  processing: boolean
  send: () => void
  stop: () => void
  chatMode: ChatMode
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
  onModeChange,
  onCollapse,
  onClose
}: ChatPanelProps) {
  const { ref: scrollRef, showTopFade, showBottomFade } = useScrollFade()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'instant' })
  }, [messages])

  const TriggerIcon =
    chatMode === 'sidebar' ? IconLayoutSidebarRightFilled : IconPictureInPictureFilled

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between pb-2 pl-2">
        {chatMode === 'solo' ? <SpaceName /> : <h1 className="text-sm font-medium">Agent</h1>}
        <div className="flex items-center gap-0.5">
          {chatMode !== 'solo' && onModeChange && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    className="pl-1.5! pr-1! gap-0"
                    variant="ghost"
                    aria-label="Switch chat mode"
                  >
                    <>
                      <TriggerIcon className="text-muted-foreground" stroke={1.75} />
                      <IconSelector className="size-4! text-muted-foreground/50" stroke={2.25} />
                    </>
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={chatMode} onValueChange={onModeChange}>
                  <DropdownMenuRadioItem value="sidebar" closeOnClick>
                    <IconLayoutSidebarRightFilled stroke={1.75} />
                    Sidebar
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="floating" closeOnClick>
                    <IconPictureInPictureFilled stroke={1.75} />
                    Floating
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {chatMode === 'sidebar' && onCollapse && (
            <Button variant="ghost" size="icon" onClick={onCollapse} aria-label="Collapse chat">
              {/* Tabler icon with double chevrons has a really weird optical size, hence the adjustments */}
              <IconChevronsRight className="text-muted-foreground size-6.5!" stroke={1.7} />
            </Button>
          )}
          {chatMode === 'floating' && onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close chat">
              <IconX className="text-muted-foreground" stroke={1.75} />
            </Button>
          )}
        </div>
      </header>

      <div
        ref={scrollRef}
        className={cn(
          'flex flex-1 flex-col gap-6 overflow-y-auto px-2 pb-12 pt-4',
          showTopFade && showBottomFade && 'mask-fade-y',
          showTopFade && !showBottomFade && 'mask-fade-top',
          !showTopFade && showBottomFade && 'mask-fade-bottom'
        )}
      >
        {messages.length === 0 && !processing && <EmptyState />}
        {messages.map((msg, i) => (
          <MessageBlock key={i} msg={msg} />
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
