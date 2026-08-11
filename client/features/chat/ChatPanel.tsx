import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import { IconChevronDown, IconChevronsRight, IconX } from '@tabler/icons-react'

import {
  canSubmitComposerAction,
  type ComposerAvailability,
  focusComposer
} from '@/client/components/shared/Composer'
import { useStickToBottom } from '@/client/features/chat/useStickToBottom'
import { groupTurns } from '@/client/features/chat/group-turns'
import { chatNoticeLabel, interleaveNotices } from '@/client/features/chat/interleave-notices'
import { attachmentKey, useLive } from '@/client/features/chat/chat-store'
import type { ChatPromptBubble } from '@/client/features/chat/ChatPromptBubbles'
import type { ChatSendOptions } from '@/client/features/chat/chat-send'
import type { ChatAnnotationControls } from '@/client/features/drawings/types'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import type { SystemNotice, Turn, ViewState } from '@/lib/types'

import type { ComposerBanner } from './composer/banners/ComposerBanner'
import { ChatComposer } from './composer/ChatComposer'
import { ChatEmptyState, resolveChatEmptyState, ViewBuilderChatEmptyState } from './ChatEmptyState'
import { ChatSelector } from './ChatSelector'
import { ThinkingIndicator, TurnView } from './TurnView'
import { Button } from '@/client/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { cn } from '@/client/lib/cn'
import { useUiStore } from '@/client/store/ui'

export type ViewBuilderChatDraft = {
  sessionId: string
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => Promise<void>
}

type ChatPanelProps = {
  active?: boolean
  focusRequest?: number
  docked?: boolean
  chatLoaded: boolean
  view: ViewState
  // The live streaming preview as a synthetic assistant turn (or null). Merged
  // into the transcript through the same groupTurns pipeline so a thinking-only
  // preview folds into the current tool group. See client/lib/preview-turn.ts.
  previewTurn?: Turn | null
  // Selected session id — used only as the scroll reset key (jump to bottom on
  // session switch).
  sessionId?: string | null
  processing: boolean
  composerBanner?: ComposerBanner
  composerAvailability: ComposerAvailability
  annotation?: ChatAnnotationControls
  send: (text: string, options?: ChatSendOptions) => void
  stop: () => void
  onSelectSession: (sessionId: string | null) => void
  // Chat on a separate tab doesn't have a close button
  onClose?: () => void
  builderDraft?: ViewBuilderChatDraft
}

const EMPTY_TURNS: Turn[] = []
const EMPTY_NOTICES: SystemNotice[] = []

export function ChatPanel({
  active = true,
  focusRequest = 0,
  docked = false,
  chatLoaded,
  view,
  previewTurn,
  sessionId,
  processing,
  composerBanner,
  composerAvailability,
  annotation,
  send,
  stop,
  onSelectSession,
  onClose,
  builderDraft
}: ChatPanelProps) {
  const workspaceId = useWorkspaceId()
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const effectiveSessionId = builderDraft?.sessionId ?? sessionId ?? null
  const turns = builderDraft ? EMPTY_TURNS : view.turns
  const hasSentMessageFromMoi = useUiStore(state => state.hasSentMessageFromMoi)
  const isWorkspacePendingAnalysis = useUiStore(state =>
    (state.workspaceIdsPendingAnalysis ?? []).includes(workspaceId)
  )
  const attachmentsUploading = useLive(state =>
    (state.attachments[attachmentKey(workspaceId, effectiveSessionId)] ?? []).some(
      attachment => attachment.status === 'uploading'
    )
  )
  const promptDisabled = !canSubmitComposerAction(true, attachmentsUploading, composerAvailability)
  // Visual grouping: fold consecutive tool-only assistant turns into one
  // synthetic turn so OpenAI Codex–style traces (which serialize one
  // assistant message per agent step) don't render with the wider
  // inter-turn gap between every tool call. See `dev/turn-spacing.md`.
  // The live preview turn is appended before grouping, so a thinking-only
  // preview merges into the trailing tool group exactly like its finalized form.
  const effectivePreviewTurn = builderDraft ? null : previewTurn
  const notices = builderDraft ? EMPTY_NOTICES : view.notices
  const groupedTurns = useMemo(
    () => groupTurns(effectivePreviewTurn ? [...turns, effectivePreviewTurn] : turns),
    [turns, effectivePreviewTurn]
  )
  // Grouped turns plus the renderable notices (compaction, model changes)
  // woven in at the moment they happened. Interleaving runs AFTER grouping so
  // a notice never splits a tool-only run apart.
  const timeline = useMemo(() => interleaveNotices(groupedTurns, notices), [groupedTurns, notices])
  const lastTurnId = groupedTurns.length > 0 ? groupedTurns[groupedTurns.length - 1].id : null
  const effectiveProcessing = builderDraft ? false : processing
  const showEmptyChat = !builderDraft && chatLoaded && timeline.length === 0 && !effectiveProcessing
  const emptyStateKind = resolveChatEmptyState({
    hasSentMessageFromMoi,
    isWorkspacePendingAnalysis
  })

  // Stick to the bottom while pinned; respect scroll-up; jump on session switch.
  const { atBottom, scrollToBottom, scrollToTop } = useStickToBottom(scrollRef, effectiveSessionId)

  useLayoutEffect(() => {
    if (showEmptyChat && emptyStateKind !== 'empty') scrollToTop()
  }, [showEmptyChat, emptyStateKind, scrollToTop])

  // The active chat surface owns initial focus. A monotonically increasing
  // request also refocuses an already-visible composer after intent actions.
  useEffect(() => {
    if (active) focusComposer(composerRef.current)
  }, [active, focusRequest])

  // Sending always returns the user to the bottom, even if they'd scrolled up —
  // they expect to see their message and the reply.
  const handleSend = useCallback(
    async (text: string, options?: ChatSendOptions) => {
      if (builderDraft) await builderDraft.onSubmit(text)
      else send(text, options)
      scrollToBottom()
    },
    [builderDraft, send, scrollToBottom]
  )

  const handlePromptSelect = useCallback(
    (prompt: ChatPromptBubble) => {
      if (promptDisabled) return
      handleSend(prompt.prompt, { directives: prompt.context })
    },
    [handleSend, promptDisabled]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-2 pb-3">
      <header className="mx-auto flex w-full max-w-[calc(var(--chat-max-container)+40px)] items-center justify-between pr-2 pb-2 pl-2">
        {builderDraft ? (
          <div className="flex h-7 items-center px-2.5 text-sm font-medium">Build a view</div>
        ) : (
          <ChatSelector selectedSessionId={sessionId ?? null} onSelectSession={onSelectSession} />
        )}
        {onClose && docked && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Undock agent">
                  <IconChevronsRight className="size-5! text-muted-foreground" stroke={1.5} />
                </Button>
              }
            />
            <TooltipContent>Undock agent</TooltipContent>
          </Tooltip>
        )}
        {!builderDraft && onClose && !docked && (
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close chat">
            <IconX stroke={2} />
          </Button>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="flex scrollbar-thin flex-1 scroll-fade flex-col overflow-y-auto overscroll-contain px-5 pt-4 pb-12 [--scroll-fade-reveal:8px]"
        >
          <div className="mx-auto flex w-full max-w-(--chat-max-container) flex-1 flex-col items-center gap-6">
            {builderDraft && <ViewBuilderChatEmptyState />}
            {showEmptyChat && (
              <ChatEmptyState
                kind={emptyStateKind}
                disabled={promptDisabled}
                onSelectPrompt={handlePromptSelect}
              />
            )}
            {timeline.map(item =>
              item.kind === 'notice' ? (
                <ChatNoticeRow key={`notice:${item.notice.id}`} notice={item.notice} />
              ) : (
                <TurnView
                  key={item.turn.id}
                  turn={item.turn}
                  processing={effectiveProcessing && item.turn.id === lastTurnId}
                />
              )
            )}
            {/* Pulsing dots only before the first token — once the preview has
                visible content it renders as a (possibly merged) grouped turn. */}
            {effectiveProcessing && !effectivePreviewTurn && <ThinkingIndicator />}
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

      <div className="mx-auto flex w-full max-w-[calc(var(--chat-max-container)+24px)] flex-col px-3">
        <div
          className={cn(
            '@container flex w-full flex-col transition-[padding]',
            composerBanner && 'gap-2 rounded-t-lg rounded-b-2xl p-2',
            composerBanner?.tone === 'default' && 'bg-accent',
            composerBanner?.tone === 'error' && 'bg-destructive/10'
          )}
        >
          {composerBanner?.content}
          <ChatComposer
            composerRef={composerRef}
            onSend={handleSend}
            onStop={stop}
            processing={effectiveProcessing}
            sessionId={effectiveSessionId}
            availability={composerAvailability}
            annotation={builderDraft ? undefined : annotation}
            allowFiles={!builderDraft}
            draft={
              builderDraft
                ? {
                    value: builderDraft.value,
                    onChange: builderDraft.onChange,
                    clearOnSend: false,
                    placeholder: 'Build a dashboard with...'
                  }
                : undefined
            }
            modelPickerScope={builderDraft ? 'workspace' : 'active-chat'}
          />
        </div>
      </div>
    </div>
  )
}

type ChatNoticeRowProps = { notice: SystemNotice }

// A quiet, centered one-liner marking a session event (context compacted,
// model changed) at its place in the transcript. Kinds without designed copy
// render nothing (see chatNoticeLabel). Exported for the /dev/chat-states
// catalog.
export function ChatNoticeRow({ notice }: ChatNoticeRowProps) {
  const label = chatNoticeLabel(notice)
  if (!label) return null
  return (
    <div className="flex justify-center">
      <span className="max-w-full truncate text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
