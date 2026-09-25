import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import {
  IconChevronDown,
  IconChevronsRight,
  IconPin,
  IconPinFilled,
  IconX
} from '@tabler/icons-react'
import { draftSessionId } from '@/lib/session-drafts'
import { useCurrentTabId, usePinnedSession } from './sessions/useSelectedSession'

import { canSubmitComposerAction, focusComposer } from '@/client/components/shared/Composer'
import { AgentBlobatar } from '@/client/components/shared/AgentBlobatar'
import { useStickToBottom } from '@/client/features/chat/messages/useStickToBottom'
import { appendPreviewTurn, groupTurns } from '@/client/features/chat/messages/group-turns'
import {
  chatNoticeLabel,
  interleaveNotices
} from '@/client/features/chat/messages/interleave-notices'
import { attachmentKey, useLive } from '@/client/features/chat/chat-store'
import type { ChatPromptBubble } from '@/client/features/chat/messages/ChatPromptBubbles'
import type { ChatSendOptions } from '@/client/features/chat/chat-send'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import type { AgentTheme, SystemNotice, Turn, ViewState } from '@/lib/types'

import type { ComposerBanner } from './composer/banners/ComposerBanner'
import { ChatComposer, type ComposerAnnotationControls } from './composer/ChatComposer'
import {
  ChatEmptyState,
  type WelcomeDestination,
  resolveChatEmptyState
} from './messages/ChatEmptyState'
import { ChatSelector } from './sessions/ChatSelector'
import { useWorkspaceSessions } from './sessions/api'
import { TurnView } from './messages/TurnView'
import { Button } from '@/client/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { cn } from '@/client/lib/cn'
import type { AgentAvailability } from '@/client/lib/agent-availability'
import { useUiStore } from '@/client/store/ui'

export type ViewChatDraft = {
  sessionId: string
  onRemoveDrawing: (localId: string) => void
}

type ChatPanelProps = {
  forkedFromSessionId?: string
  agent: AgentTheme
  active?: boolean
  focusRequest?: number
  docked?: boolean
  chatLoaded: boolean
  hasWorkspaceApplets: boolean
  view: ViewState
  // The live streaming preview as a synthetic assistant turn (or null). Merged
  // into the trailing assistant run so a thinking-only
  // preview folds into the current tool group. See client/lib/preview-turn.ts.
  previewTurn?: Turn | null
  // Selected session id — used only as the scroll reset key (jump to bottom on
  // session switch).
  sessionId?: string | null
  processing: boolean
  composerBanner?: ComposerBanner
  agentAvailability: AgentAvailability
  annotation?: ComposerAnnotationControls
  send: (text: string, options?: ChatSendOptions) => Promise<void>
  stop: () => void
  onNavigateFromWelcome: (destination: WelcomeDestination) => void
  // Chat on a separate tab doesn't have a close button
  onClose?: () => void
  viewDraft?: ViewChatDraft
}

const EMPTY_TURNS: Turn[] = []
const EMPTY_NOTICES: SystemNotice[] = []

export function ChatPanel({
  forkedFromSessionId,
  agent,
  active = true,
  focusRequest = 0,
  docked = false,
  chatLoaded,
  hasWorkspaceApplets,
  view,
  previewTurn,
  sessionId,
  processing,
  composerBanner,
  agentAvailability,
  annotation,
  send,
  stop,
  onNavigateFromWelcome,
  onClose,
  viewDraft
}: ChatPanelProps) {
  const workspaceId = useWorkspaceId()
  const { data: sessions } = useWorkspaceSessions(workspaceId)
  const sourceName = sessions?.find(session => session.sessionId === forkedFromSessionId)?.summary
  const tabId = useCurrentTabId()
  const { pinnedSessionId, pin } = usePinnedSession()
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const effectiveSessionId = viewDraft?.sessionId ?? sessionId ?? draftSessionId(tabId)
  const modelSessionId = viewDraft ? null : (sessionId ?? null)
  const turns = viewDraft ? EMPTY_TURNS : view.turns
  const hasSentMessageFromMoi = useUiStore(state => state.hasSentMessageFromMoi)
  const isWorkspacePendingAnalysis = useUiStore(state =>
    (state.workspaceIdsPendingAnalysis ?? []).includes(workspaceId)
  )
  const attachmentsUploading = useLive(state =>
    (state.attachments[attachmentKey(workspaceId, effectiveSessionId)] ?? []).some(
      attachment => attachment.kind !== 'text' && attachment.status === 'uploading'
    )
  )
  const chatReady = chatLoaded || !!viewDraft
  const promptDisabled =
    !chatReady || !canSubmitComposerAction(true, attachmentsUploading, agentAvailability)
  // Visual grouping: fold consecutive tool-only assistant turns into one
  // synthetic turn so OpenAI Codex–style traces (which serialize one
  // assistant message per agent step) don't render with the wider
  // inter-turn gap between every tool call. See `dev/turn-spacing.md`.
  // Group saved history once, then merge previews into just the trailing run.
  const effectivePreviewTurn = viewDraft ? null : previewTurn
  const notices = viewDraft ? EMPTY_NOTICES : view.notices
  const savedGroups = useMemo(() => groupTurns(turns), [turns])
  const groupedTurns = useMemo(
    () => appendPreviewTurn(savedGroups, effectivePreviewTurn),
    [savedGroups, effectivePreviewTurn]
  )
  // Grouped turns plus the renderable notices (compaction, model changes)
  // woven in at the moment they happened. Interleaving runs AFTER grouping so
  // a notice never splits a tool-only run apart.
  const timeline = useMemo(() => interleaveNotices(groupedTurns, notices), [groupedTurns, notices])
  const lastTurnId = groupedTurns.length > 0 ? groupedTurns[groupedTurns.length - 1].id : null
  const effectiveProcessing = viewDraft ? false : processing
  const showEmptyState =
    !!viewDraft ||
    (!forkedFromSessionId && chatLoaded && timeline.length === 0 && !effectiveProcessing)
  const showTranscript = chatLoaded && !showEmptyState
  const emptyStateKind = resolveChatEmptyState({
    tabId,
    isViewDraft: !!viewDraft,
    hasSentMessageFromMoi,
    isWorkspacePendingAnalysis
  })

  // Stick to the bottom while pinned; respect scroll-up; jump on session switch.
  const { atBottom, scrollToBottom, scrollToTop } = useStickToBottom(scrollRef, effectiveSessionId)

  useLayoutEffect(() => {
    if (showEmptyState && emptyStateKind !== 'overview-empty' && emptyStateKind !== 'tab-empty')
      scrollToTop()
  }, [showEmptyState, emptyStateKind, scrollToTop])

  // The active chat surface owns initial focus. A monotonically increasing
  // request also refocuses an already-visible composer after intent actions.
  useEffect(() => {
    if (active) focusComposer(composerRef.current)
  }, [active, focusRequest])

  // Sending always returns the user to the bottom, even if they'd scrolled up —
  // they expect to see their message and the reply.
  const handleSend = useCallback(
    async (text: string, options?: ChatSendOptions) => {
      await send(text, options)
      scrollToBottom()
    },
    [send, scrollToBottom]
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
      <header className="mx-auto flex w-full max-w-[calc(var(--chat-max-container)+40px)] min-w-0 items-center justify-between pr-2 pb-2 pl-2">
        <div className="min-w-0 flex-1">
          <ChatSelector className={cn('text-foreground', docked && 'text-muted-foreground')} />
        </div>
        {sessionId && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(docked && 'text-muted-foreground')}
                  onClick={() => pin(pinnedSessionId ? null : sessionId)}
                  aria-label={pinnedSessionId ? 'Unpin chat' : 'Pin chat'}
                  aria-pressed={!!pinnedSessionId}
                >
                  {pinnedSessionId ? <IconPinFilled stroke={1.75} /> : <IconPin stroke={1.75} />}
                </Button>
              }
            />
            <TooltipContent>{pinnedSessionId ? 'Unpin chat' : 'Pin chat'}</TooltipContent>
          </Tooltip>
        )}
        {onClose && docked && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Undock chat">
                  <IconChevronsRight className="size-5! text-muted-foreground" stroke={1.5} />
                </Button>
              }
            />
            <TooltipContent>Undock chat</TooltipContent>
          </Tooltip>
        )}
        {!viewDraft && onClose && !docked && (
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close chat">
            <IconX stroke={2} />
          </Button>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="flex scrollbar-thin flex-1 scroll-fade flex-col overflow-y-auto overscroll-contain px-5 pt-4 pb-8 [--scroll-fade-reveal:8px]"
        >
          <div className="mx-auto flex w-full max-w-(--chat-max-container) flex-1 flex-col gap-6">
            {forkedFromSessionId && (
              <div role="note" className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span className="font-medium">View chat started</span>
                <span>Context inherited from {sourceName || 'another chat'}</span>
              </div>
            )}
            {showEmptyState && (
              <ChatEmptyState
                agent={agent}
                kind={emptyStateKind}
                hasWorkspaceApplets={hasWorkspaceApplets}
                disabled={promptDisabled}
                onSelectPrompt={handlePromptSelect}
                onNavigate={onNavigateFromWelcome}
              />
            )}
            {showTranscript &&
              timeline.map(item =>
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
            {showTranscript && (
              <div className="mt-auto -ml-3 pt-2">
                <AgentBlobatar
                  preset={agent}
                  color="primary"
                  animated={effectiveProcessing}
                  expression={effectiveProcessing ? 'thinking' : undefined}
                />
              </div>
            )}
          </div>
        </div>

        {/* Jump to latest — shown only when scrolled up, so following the tail
            never yanks the user while they read history. */}
        {showTranscript && !atBottom && turns.length > 0 && (
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
            modelSessionId={modelSessionId}
            availability={agentAvailability}
            chatReady={chatReady}
            annotation={viewDraft ? undefined : annotation}
            onRemoveDrawing={viewDraft?.onRemoveDrawing ?? annotation?.onRemove}
            allowFiles={!viewDraft}
            placeholder={viewDraft ? 'Drop in the details' : undefined}
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
