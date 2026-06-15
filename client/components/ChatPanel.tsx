import { type ReactNode, useEffect, useMemo } from 'react'

import { IconChevronsRight, IconSelector, IconX } from '@tabler/icons-react'

import { useScrollFade } from '@/client/hooks/useScrollFade'
import { cn } from '@/client/lib/cn'
import { groupTurns } from '@/client/lib/group-turns'
import type { ViewState } from '@/lib/types'

import { ChatInput } from './ChatInput'
import { ThreadSelector } from './ThreadSelector'
import { EmptyState, ThinkingIndicator, TurnView } from './TurnView'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

export type ChatMode = 'sidebar' | 'floating'

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
  view: ViewState
  input: string
  setInput: (v: string) => void
  processing: boolean
  error?: string | null
  onDismissError?: () => void
  send: () => void
  stop: () => void
  chatMode: ChatMode
  onSwitchThread: (sessionId: string | null) => void
  onModeChange?: (mode: 'sidebar' | 'floating') => void
  onCollapse?: () => void
  onClose?: () => void
  // Rendered at the start of the chat header. Solo mode passes the sidebar
  // toggle here since there's no separate workspace header beside the chat.
  leading?: ReactNode
}

export function ChatPanel({
  view,
  input,
  setInput,
  processing,
  error,
  onDismissError,
  send,
  stop,
  chatMode,
  onSwitchThread,
  onModeChange,
  onCollapse,
  onClose,
  leading
}: ChatPanelProps) {
  const { ref: scrollRef, showTopFade, showBottomFade } = useScrollFade()
  const turns = view.turns
  // Visual grouping: fold consecutive tool-only assistant turns into one
  // synthetic turn so OpenAI Codex–style traces (which serialize one
  // assistant message per agent step) don't render with the wider
  // inter-turn gap between every tool call. See `dev/turn-spacing.md`.
  const groupedTurns = useMemo(() => groupTurns(turns), [turns])

  useEffect(() => {
    const el = scrollRef.current
    el?.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
  }, [scrollRef, turns])

  const TriggerIcon = chatMode === 'sidebar' ? ChatModeIconSidebar : ChatModeIconFloating

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between pb-2 pl-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {leading}
          <ThreadSelector onSwitch={onSwitchThread} />
        </div>
        <div className="flex items-center gap-0.5">
          {onModeChange && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    className="gap-0 pr-1! pl-2!"
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
              <IconChevronsRight className="size-6! text-muted-foreground" stroke={1.5} />
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
        ref={scrollRef}
        className={cn(
          'flex flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-2 pt-4 pb-12',
          showTopFade && showBottomFade && 'mask-fade-y',
          showTopFade && !showBottomFade && 'mask-fade-top',
          !showTopFade && showBottomFade && 'mask-fade-bottom'
        )}
      >
        {turns.length === 0 && !processing && <EmptyState />}
        {groupedTurns.map((turn, i) => (
          <TurnView
            key={turn.id}
            turn={turn}
            processing={processing && i === groupedTurns.length - 1}
          />
        ))}
        {processing && <ThinkingIndicator />}
      </div>

      <div>
        {error && (
          <div className="mb-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <span className="flex-1 break-words">{error}</span>
            {onDismissError && (
              <button
                type="button"
                onClick={onDismissError}
                className="text-red-600 hover:text-red-900"
                aria-label="Dismiss error"
              >
                <IconX size={14} stroke={1.5} />
              </button>
            )}
          </div>
        )}
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
