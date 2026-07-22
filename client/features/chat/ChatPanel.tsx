import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import { IconChevronDown, IconX } from '@tabler/icons-react'

import { useStickToBottom } from '@/client/features/chat/useStickToBottom'
import { groupTurns } from '@/client/features/chat/group-turns'
import type { Turn, ViewState } from '@/lib/types'

import { ChatComposer } from './ChatComposer'
import { ChatSelector } from './ChatSelector'
import { ChatWelcome } from './ChatWelcome'
import { EmptyState, ThinkingIndicator, TurnView } from './TurnView'
import { Button } from '@/client/components/ui/button'
import { useUiStore } from '@/client/store/ui'

type ChatPanelProps = {
  active?: boolean
  focusRequest?: number
  chatReady: boolean
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
  unavailableReason: string | null | undefined
  send: (text: string) => void
  stop: () => void
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
  chatReady,
  view,
  previewTurn,
  sessionId,
  processing,
  error,
  onDismissError,
  unavailableReason,
  send,
  stop,
  onSwitchThread,
  headerLeft,
  headerRight,
  onClose
}: ChatPanelProps) {
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const turns = view.turns
  const hasSentMessageFromMoi = useUiStore(state => state.hasSentMessageFromMoi)
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
  const showEmptyChat = chatReady && groupedTurns.length === 0 && !processing

  // Stick to the bottom while pinned; respect scroll-up; jump on thread switch.
  const { atBottom, scrollToBottom, scrollToTop } = useStickToBottom(scrollRef, sessionId)

  useLayoutEffect(() => {
    if (showEmptyChat && !hasSentMessageFromMoi) scrollToTop()
  }, [showEmptyChat, hasSentMessageFromMoi, scrollToTop])

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
    <div className="flex min-h-0 flex-1 flex-col pt-2 pb-3">
      <header className="flex items-center justify-between pr-2 pb-2 pl-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {headerLeft}
          <ChatSelector onSwitch={onSwitchThread} />
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
          className="flex scrollbar-thin flex-1 scroll-fade flex-col overflow-y-auto overscroll-contain px-5 pt-4 pb-12 [--scroll-fade-reveal:8px]"
        >
          <div className="mx-auto flex w-full max-w-(--chat-max-container) flex-1 flex-col gap-6">
            {showEmptyChat &&
              (hasSentMessageFromMoi ? (
                <EmptyState />
              ) : (
                <ChatWelcome onSelectPrompt={handleSend} />
              ))}
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

      <div className="mx-auto flex w-full flex-col items-center px-3">
        {error && (
          <div className="mb-2 flex w-full max-w-(--chat-max-container) items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <span className="flex-1 wrap-break-word">{error}</span>
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
          unavailableReason={unavailableReason}
        />
      </div>
    </div>
  )
}
