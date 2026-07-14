import { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react'

import { IconChevronDown, IconX } from '@tabler/icons-react'

import { useScrollFade } from '@/client/hooks/useScrollFade'
import { useStickToBottom } from '@/client/features/chat/useStickToBottom'
import { cn } from '@/client/lib/cn'
import { groupTurns } from '@/client/features/chat/group-turns'
import type { Turn, ViewState } from '@/lib/types'

import { ChatComposer } from './ChatComposer'
import { ThreadSelector } from './ThreadSelector'
import { EmptyState, ThinkingIndicator, TurnView } from './TurnView'
import { Button } from '@/client/components/ui/button'

type ChatPanelProps = {
  active?: boolean
  focusRequest?: number
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
  // Constrain the scrollable history and the composer to a centered max-width
  // column (var --chat-max-container) while the header still spans full width.
  // Always on for now; will be toggled per layout mode later.
  contained?: boolean
  onSwitchThread: (sessionId: string | null) => void
  // Extra content for the header's left edge, rendered before the thread
  // selector when the chat is the primary panel.
  headerLeft?: ReactNode
  // Extra controls for the header's right edge — the parent supplies whatever
  // chrome belongs here in the current layout (e.g. the section reopen toggle
  // plus MCP/settings menus when the chat is fullscreen).
  headerRight?: ReactNode
  // Floating popup: render a close (X) button that dismisses the popup.
  onClose?: () => void
}

export function ChatPanel({
  active = true,
  focusRequest = 0,
  view,
  previewTurn,
  sessionId,
  processing,
  error,
  onDismissError,
  send,
  stop,
  contained = true,
  onSwitchThread,
  headerLeft,
  headerRight,
  onClose
}: ChatPanelProps) {
  const composerRef = useRef<HTMLTextAreaElement>(null)
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

  // The active chat surface owns initial focus. A monotonically increasing
  // request also refocuses an already-visible composer after intent actions.
  useEffect(() => {
    if (active) composerRef.current?.focus()
  }, [active, focusRequest])

  // Sending always returns the user to the bottom, even if they'd scrolled up —
  // they expect to see their message and the reply.
  const handleSend = useCallback(
    (text: string) => {
      send(text)
      scrollToBottom()
    },
    [send, scrollToBottom]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-2 pb-4">
      <header className="flex items-center justify-between pr-2 pb-2 pl-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {headerLeft}
          <ThreadSelector onSwitch={onSwitchThread} />
        </div>
        <div className="flex items-center gap-0.5">
          {headerRight}
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close chat">
              <IconX stroke={1.5} />
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
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => scrollToBottom('smooth')}
            aria-label="Jump to latest"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 animate-in rounded-full fade-in slide-in-from-bottom-1"
          >
            <IconChevronDown stroke={1.5} />
          </Button>
        )}
      </div>

      <div className={cn(contained && 'mx-auto w-full max-w-[var(--chat-max-container)] px-3')}>
        {error && (
          <div className="mb-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <span className="flex-1 break-words">{error}</span>
            {onDismissError && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onDismissError}
                className="-m-1"
                aria-label="Dismiss error"
              >
                <IconX stroke={1.75} />
              </Button>
            )}
          </div>
        )}
        <ChatComposer
          composerRef={composerRef}
          onSend={handleSend}
          onStop={stop}
          processing={processing}
        />
      </div>
    </div>
  )
}
