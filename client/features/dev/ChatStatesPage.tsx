// Designer-facing dev route: ONE continuous conversation rendered by the
// PRODUCTION chat components (TurnView, tool groups, subagent cards, notice
// rows, the preview-turn path, selector rows) over inline fixtures — no server
// data. The transcript runs through the exact ChatPanel pipeline (groupTurns →
// interleaveNotices → TurnView/ChatNoticeRow, plus the live tail), so a
// designer can restyle the chat by looking at this page and it stays truthful
// as components evolve. A fixed control switches the live tail state and the
// error banner; the sidebar holds jump links to each scripted state.
import { useEffect, useState } from 'react'

import { IconChevronDown, IconEdit } from '@tabler/icons-react'

import { AgentBlobatar } from '@/client/components/shared/AgentBlobatar'
import { Button } from '@/client/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/client/components/ui/dropdown-menu'
import { Switch } from '@/client/components/ui/switch'
import { ChatNoticeRow } from '@/client/features/chat/ChatPanel'
import { ChatErrorBanner } from '@/client/features/chat/composer/banners/ChatErrorBanner'
import { ChatSessionItem } from '@/client/features/chat/ChatSelector'
import { TurnView } from '@/client/features/chat/TurnView'
import { isSessionRunning, liveStore } from '@/client/features/chat/chat-store'
import { groupTurns } from '@/client/features/chat/group-turns'
import { interleaveNotices } from '@/client/features/chat/interleave-notices'
import { buildPreviewTurn } from '@/client/features/chat/preview-turn'
import {
  WorkspaceLayoutContext,
  type WorkspaceLayoutContextValue
} from '@/client/features/workspace/WorkspaceLayoutContext'
import { cn } from '@/client/lib/cn'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import type { SystemNotice, Turn } from '@/lib/types'

import {
  DEV_CWD,
  DEV_WORKSPACE_ID,
  RUNNING_SELECTOR_SESSION_ID,
  chatError,
  conversationAnchors,
  conversationNotices,
  conversationTurns,
  reasoningStreamPreview,
  selectorSessions,
  textStreamPreview,
  toLivePreview
} from './chat-states-fixtures'

// Static stand-in for the query-backed workspace layout provider: TurnView
// reads `cwd` from this context to shorten tool paths.
const layoutCtxValue: WorkspaceLayoutContextValue = {
  layout: createDefaultWorkspaceLayout(),
  setLayout: () => {},
  name: 'moi',
  icon: null,
  cwd: DEV_CWD,
  provider: 'openclaw',
  workspaceId: DEV_WORKSPACE_ID,
  isLoading: false
}

// Map from timeline item id (turn or notice) → anchor slug, for the invisible
// jump targets woven between conversation items.
const ANCHOR_BY_ITEM_ID: Record<string, string> = Object.fromEntries(
  conversationAnchors.map(a => [a.itemId, a.anchor])
)

type TailState = 'none' | 'waiting' | 'thinking' | 'text'
type BackgroundState = 'default' | 'muted'

const TAIL_OPTIONS: { value: TailState; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'thinking', label: 'Thinking' },
  { value: 'text', label: 'Text' }
]

const BACKGROUND_OPTIONS: { value: BackgroundState; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'muted', label: 'Muted' }
]

function tailPreviewTurn(tail: TailState): Turn | null {
  if (tail === 'thinking') return buildPreviewTurn(toLivePreview(reasoningStreamPreview))
  if (tail === 'text') return buildPreviewTurn(toLivePreview(textStreamPreview))
  return null
}

type TranscriptProps = {
  turns: Turn[]
  notices?: SystemNotice[]
  previewTurn?: Turn | null
  processing?: boolean
  // Timeline item id (turn/notice) → anchor element id injected before it.
  anchors?: Record<string, string>
}

// Mirrors ChatPanel's timeline: append the preview turn, fold tool-only turns
// (groupTurns), weave notices in, then map to the real row components. The
// transcript avatar holds its thinking expression for the complete active run.
// Anchors render as zero-size absolute spans so the gap-6 rhythm between items
// stays untouched.
function Transcript({
  turns,
  notices = [],
  previewTurn = null,
  processing = false,
  anchors = {}
}: TranscriptProps) {
  const grouped = groupTurns(previewTurn ? [...turns, previewTurn] : turns)
  const timeline = interleaveNotices(grouped, notices)
  const lastTurnId = grouped.length > 0 ? grouped[grouped.length - 1].id : null
  return (
    <div className="flex w-full flex-col gap-6">
      {timeline.map(item => {
        const id = item.kind === 'notice' ? item.notice.id : item.turn.id
        const anchor = anchors[id]
        return (
          <div key={item.kind === 'notice' ? `notice:${id}` : id} className="relative">
            {anchor && <span id={anchor} aria-hidden className="absolute -top-8" />}
            {item.kind === 'notice' ? (
              <ChatNoticeRow notice={item.notice} />
            ) : (
              <TurnView turn={item.turn} processing={processing && item.turn.id === lastTurnId} />
            )}
          </div>
        )
      })}
      <div className="-ml-3 pt-2">
        <AgentBlobatar
          color="primary"
          animated={processing}
          expression={processing ? 'thinking' : undefined}
        />
      </div>
    </div>
  )
}

function noop() {}
async function asyncNoop() {}

// The real chat header strip: the session dropdown, closed by default, with
// the fixture rows (badges, running spinner) inside — same composition as
// ChatSelector's menu.
function SelectorHeader() {
  return (
    <header className="flex w-full items-center justify-between pr-2 pb-2 pl-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost">
              <span className="max-w-64 truncate">{selectorSessions[0].summary}</span>
              <IconChevronDown stroke={1.5} />
            </Button>
          }
        />
        <DropdownMenuContent
          align="start"
          className="flex max-h-100 w-max max-w-72 min-w-40 flex-col overflow-hidden"
        >
          <DropdownMenuItem
            className="shrink-0 gap-1 font-medium text-muted-foreground! **:text-muted-foreground!"
            onClick={noop}
          >
            <IconEdit size={16} stroke={1.75} />
            New chat
          </DropdownMenuItem>
          <DropdownMenuSeparator className="shrink-0" />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Today</DropdownMenuLabel>
            {selectorSessions.map(session => (
              <ChatSessionItem
                key={session.sessionId}
                session={session}
                active={session.sessionId === selectorSessions[0].sessionId}
                // The archive affordance replaces the running spinner on
                // hover/touch, so the running row keeps archiving off to show
                // the pure spinner treatment.
                canArchive={session.sessionId !== RUNNING_SELECTOR_SESSION_ID}
                confirmingArchive={false}
                onSelect={noop}
                onArchive={asyncNoop}
                onRequestArchive={noop}
                workspaceId={DEV_WORKSPACE_ID}
              />
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}

type TailControlsProps = {
  tail: TailState
  onTail: (tail: TailState) => void
  background: BackgroundState
  onBackground: (background: BackgroundState) => void
  showError: boolean
  onShowError: (show: boolean) => void
}

// Fixed dev control for the conversation's live tail and the error banner.
// Sits at the end of the page DOM, so it paints above the content without
// z-index.
function TailControls({
  tail,
  onTail,
  background,
  onBackground,
  showError,
  onShowError
}: TailControlsProps) {
  return (
    <div className="fixed right-4 bottom-20 flex flex-col gap-2 rounded-xl bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-border">
      <span className="px-1 text-xs text-muted-foreground">Live tail</span>
      <div className="flex gap-1 rounded-lg bg-accent p-1">
        {TAIL_OPTIONS.map(option => (
          <Button
            key={option.value}
            type="button"
            variant={tail === option.value ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onTail(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <span className="px-1 text-xs text-muted-foreground">Background</span>
      <div className="flex gap-1 rounded-lg bg-accent p-1">
        {BACKGROUND_OPTIONS.map(option => (
          <Button
            key={option.value}
            type="button"
            variant={background === option.value ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onBackground(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        Error banner
        <Switch checked={showError} onCheckedChange={onShowError} />
      </label>
    </div>
  )
}

export function ChatStatesPage() {
  const [tail, setTail] = useState<TailState>('text')
  const [background, setBackground] = useState<BackgroundState>('default')
  const [showError, setShowError] = useState(false)

  // The running selector row's spinner reads the live activity store. Seed it,
  // and re-seed after any server status_snapshot reconcile (which rebuilds the
  // activity map and would drop this fixture entry).
  useEffect(() => {
    const seed = () => {
      const state = liveStore.getState()
      if (!isSessionRunning(state.activity, DEV_WORKSPACE_ID, RUNNING_SELECTOR_SESSION_ID)) {
        state.setActivity(DEV_WORKSPACE_ID, RUNNING_SELECTOR_SESSION_ID, 'running')
      }
    }
    seed()
    const unsubscribe = liveStore.subscribe(seed)
    return () => {
      unsubscribe()
      liveStore.getState().setActivity(DEV_WORKSPACE_ID, RUNNING_SELECTOR_SESSION_ID, 'idle')
    }
  }, [])

  const previewTurn = tailPreviewTurn(tail)
  const processing = tail !== 'none'

  return (
    <WorkspaceLayoutContext value={layoutCtxValue}>
      <div
        className={cn(
          'min-h-dvh font-sans text-foreground',
          background === 'default' ? 'bg-background' : 'bg-muted'
        )}
      >
        <div className="mx-auto flex w-full max-w-5xl gap-10 px-6 py-10">
          <nav className="sticky top-10 hidden h-fit w-44 shrink-0 flex-col gap-1.5 self-start xl:flex">
            <span className="pb-1 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
              Chat states
            </span>
            {conversationAnchors.map(entry => (
              <a
                key={entry.anchor}
                href={`#${entry.anchor}`}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {entry.label}
              </a>
            ))}
          </nav>

          <main className="flex w-full max-w-(--chat-max-container) min-w-0 flex-1 flex-col">
            <header className="flex flex-col gap-1 pb-6">
              <span className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                Playground / Chat states
              </span>
              <p className="text-sm text-muted-foreground">
                One continuous conversation covering every chat state, rendered by the production
                components over inline fixtures.
              </p>
            </header>

            <SelectorHeader />

            <div className="flex flex-col pt-4">
              <Transcript
                turns={conversationTurns}
                notices={conversationNotices}
                previewTurn={previewTurn}
                processing={processing}
                anchors={ANCHOR_BY_ITEM_ID}
              />

              {showError && (
                <div className="mt-6 flex w-full flex-col gap-2 rounded-t-xl rounded-b-2xl bg-destructive/10 p-2">
                  <ChatErrorBanner error={chatError} onDismiss={() => setShowError(false)} />
                </div>
              )}
            </div>

            <details className="mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium">Notes for designers</summary>
              <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-4">
                <li>
                  User bubbles render markdown verbatim (whitespace preserved, no markdown parsing)
                  — the fenced code block in the long question is intentional.
                </li>
                <li>
                  The moon reply carries a full <code>TurnMeta</code> payload (model, provider, stop
                  reason, usage, cost) but nothing in the transcript renders meta yet — it rides on
                  the turn for future treatments.
                </li>
                <li>
                  Approval-pending and approval-denied tool rows render as plain dot rows with no
                  body; there is no dedicated approval treatment yet.
                </li>
                <li>
                  Pending and running tool calls render identically (spinner node, no output).
                </li>
                <li>
                  Channel provenance (the IRC hello) lives on the session (<code>origin</code> badge
                  in the selector), not on the turn — the gateway's inbound metadata envelope is
                  stripped before display.
                </li>
                <li>
                  Nested subagent transcripts render reasoning and tool rows only; nested plain text
                  is skipped, and the final answer shows in the summary segment.
                </li>
                <li>
                  The transcript avatar keeps its thinking expression for the full active run,
                  including while reasoning, text, or tool output is visible.
                </li>
                <li>
                  Empty-chat states (<code>ChatEmptyState</code>: placeholder and first-run welcome)
                  cannot appear in a continuous transcript — find them in the chat with no turns.
                </li>
                <li>
                  Text-part <code>citations</code> (the sources reply carries one) are not rendered
                  — only the standalone <code>source-url</code> / <code>source-document</code> parts
                  show, as small underlined links.
                </li>
                <li>
                  <code>Edit</code> results render as plain text — <code>ToolOutput</code>{' '}
                  highlights only read/write-with-content or JSON outputs.
                </li>
                <li>
                  The image <code>Read</code> row's expanded body holds a{' '}
                  <code>ReadImagePreview</code> that loads the workspace preview endpoint; with this
                  page's fake workspace id the request 404s and the preview hides itself, leaving
                  the body empty. It needs a live workspace to show the picture.
                </li>
                <li>
                  <code>TurnOrigin</code> <code>'tool-return'</code> turns never reach the
                  transcript: adapters strip <code>tool_result</code> blocks and fold them into the
                  owning tool call, so no adapter emits one. (If one ever appeared, TurnView would
                  render its parts left-aligned, without the user bubble.)
                </li>
              </ul>

              <p className="mt-5 font-medium text-foreground">No rendering yet</p>
              <p className="mt-1">
                These claude-code states reach the client but currently render nothing in the chat —
                each needs a designed treatment, not just styling (shapes in{' '}
                <code>lib/format.ts</code>):
              </p>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4">
                <li>
                  <code>rate-limit</code> notice —{' '}
                  <code>{"{ kind: 'rate-limit', at, info: { resetsAt: 1754300400 } }"}</code>
                </li>
                <li>
                  <code>api-retry</code> notice —{' '}
                  <code>
                    {
                      "{ kind: 'api-retry', at, attempt: 2, maxRetries: 10, delayMs: 8000, error: 'overloaded_error' }"
                    }
                  </code>
                </li>
                <li>
                  <code>hook</code> notice —{' '}
                  <code>
                    {
                      "{ kind: 'hook', at, hookId: 'hook_1a2b', hookName: 'PostToolUse', event: 'PostToolUse', status: 'response', output: 'ok', exitCode: 0, outcome: 'success' }"
                    }
                  </code>
                </li>
                <li>
                  <code>session-state</code> notice —{' '}
                  <code>{"{ kind: 'session-state', at, state: 'requires-action' }"}</code> (blocked
                  on a permission prompt; no loader or banner exists for it).
                </li>
                <li>
                  <code>files-persisted</code> notice —{' '}
                  <code>
                    {
                      "{ kind: 'files-persisted', at, files: ['notes/summary.md'], failed: [{ filename: 'shots/huge.png', error: 'exceeds size limit' }] }"
                    }
                  </code>
                </li>
                <li>
                  <code>elicitation</code> notice —{' '}
                  <code>
                    {"{ kind: 'elicitation', at, server: 'github', elicitationId: 'elic_7f3a' }"}
                  </code>
                </li>
                <li>
                  <code>SessionSnapshot</code> —{' '}
                  <code>
                    {
                      "{ sessionId, model: 'claude-sonnet-4-6', cwd, permissionMode: 'bypassPermissions', tools: ['Bash', 'Read', …], mcpServers: [{ name: 'github', status: 'connected' }], skills: ['moi-workspace'], … }"
                    }
                  </code>
                </li>
                <li>
                  <code>ResultSummary</code> —{' '}
                  <code>{"{ subtype: 'success', cost: 0.1129, turns: 6, durationMs: 48210 }"}</code>{' '}
                  (error subtypes: <code>error_during_execution</code>, <code>error_max_turns</code>
                  , budget and structured-output variants).
                </li>
              </ul>
            </details>
          </main>
        </div>

        <TailControls
          tail={tail}
          onTail={setTail}
          background={background}
          onBackground={setBackground}
          showError={showError}
          onShowError={setShowError}
        />
      </div>
    </WorkspaceLayoutContext>
  )
}
