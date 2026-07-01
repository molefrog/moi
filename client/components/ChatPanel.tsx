import { useCallback, useMemo } from 'react'

import { IconChevronDown, IconChevronsRight, IconSelector, IconX } from '@tabler/icons-react'

import { useScrollFade } from '@/client/hooks/useScrollFade'
import { useStickToBottom } from '@/client/hooks/useStickToBottom'
import { cn } from '@/client/lib/cn'
import { groupTurns } from '@/client/lib/group-turns'
import type { ChatDisplay, Turn, ViewState } from '@/lib/types'

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

function ChatModeIconFullscreen({ className }: ChatModeIconProps) {
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
      <rect x="4.5" y="6.5" width="15" height="11" rx="1" fill="currentColor" />
    </svg>
  )
}

type ChatPanelProps = {
  view: ViewState
  // The live streaming preview as a synthetic assistant turn (or null). Merged
  // into the transcript through the same groupTurns pipeline so a thinking-only
  // preview folds into the current tool group. See client/lib/preview-turn.ts.
  previewTurn?: Turn | null
  // Active thread id — used only as the scroll reset key (jump to bottom on
  // thread switch).
  sessionId?: string | null
  processing: boolean
  error?: string | null
  onDismissError?: () => void
  send: (text: string) => void
  stop: () => void
  // How the chat is shown right now (position, or fullscreen). The mode switch
  // and collapse/close affordances key off this; fullscreen shows neither.
  chatMode: ChatDisplay
  // Constrain the scrollable history and the composer to a centered max-width
  // column (var --chat-max-container) while the header still spans full width.
  // Always on for now; will be toggled per layout mode later.
  contained?: boolean
  onSwitchThread: (sessionId: string | null) => void
  // The chat display picker — sidebar / floating (position) and fullscreen (the
  // transient view). The parent routes each to the right state.
  onModeChange?: (mode: ChatDisplay) => void
  onCollapse?: () => void
  onClose?: () => void
}

export function ChatPanel({
  view,
  previewTurn,
  sessionId,
  processing,
  error,
  onDismissError,
  send,
  stop,
  chatMode,
  contained = true,
  onSwitchThread,
  onModeChange,
  onCollapse,
  onClose
}: ChatPanelProps) {
  const { ref: scrollRef, showTopFade, showBottomFade } = useScrollFade()
  const turns = view.turns
  // Visual grouping: fold consecutive tool-only assistant turns into one
  // synthetic turn so OpenAI Codex–style traces (which serialize one
  // assistant message per agent step) don't render with the wider
  // inter-turn gap between every tool call. See `dev/turn-spacing.md`.
  // The live preview turn is appended before grouping, so a thinking-only
  // preview merges into the trailing tool group exactly like its finalized form.
  const groupedTurns = useMemo(
    () => groupTurns(previewTurn ? [...turns, previewTurn] : turns),
    [turns, previewTurn]
  )

  // Stick to the bottom while pinned; respect scroll-up; jump on thread switch.
  const { atBottom, scrollToBottom } = useStickToBottom(scrollRef, sessionId)

  // Sending always returns the user to the bottom, even if they'd scrolled up —
  // they expect to see their message and the reply.
  const handleSend = useCallback(
    (text: string) => {
      send(text)
      scrollToBottom()
    },
    [send, scrollToBottom]
  )

  const TriggerIcon =
    chatMode === 'sidebar'
      ? ChatModeIconSidebar
      : chatMode === 'floating'
        ? ChatModeIconFloating
        : ChatModeIconFullscreen

  return (
    <div className="flex h-full flex-col pt-2 pb-4">
      <header className="flex items-center justify-between pr-2 pb-2 pl-5">
        <div className="flex min-w-0 items-center gap-2.5">
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
                  <DropdownMenuRadioItem value="fullscreen" closeOnClick>
                    <ChatModeIconFullscreen />
                    Fullscreen
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

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className={cn(
            'flex scrollbar-thin flex-1 flex-col overflow-y-auto overscroll-contain px-5 pt-4 pb-12',
            showTopFade && showBottomFade && 'mask-fade-y',
            showTopFade && !showBottomFade && 'mask-fade-top',
            !showTopFade && showBottomFade && 'mask-fade-bottom'
          )}
        >
          <div
            className={cn(
              'flex flex-1 flex-col gap-6',
              contained && 'mx-auto w-full max-w-[var(--chat-max-container)]'
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
            {/* Pulsing dots only before the first token — once the preview has
                visible content it renders as a (possibly merged) grouped turn. */}
            {processing && !previewTurn && <ThinkingIndicator />}
          </div>
        </div>

        {/* Jump to latest — shown only when scrolled up, so following the tail
            never yanks the user while they read history. */}
        {!atBottom && turns.length > 0 && (
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            aria-label="Jump to latest"
            className="absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 animate-in items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md transition-colors duration-150 fade-in slide-in-from-bottom-1 hover:text-foreground"
          >
            <IconChevronDown size={18} stroke={1.5} />
          </button>
        )}
      </div>

      <div className={cn(contained && 'mx-auto w-full max-w-[var(--chat-max-container)] px-3')}>
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
        <ChatInput onSend={handleSend} onStop={stop} processing={processing} />
      </div>
    </div>
  )
}
