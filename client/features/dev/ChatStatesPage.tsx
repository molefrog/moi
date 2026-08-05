// Designer-facing catalog of every chat state, rendered by the PRODUCTION chat
// components (TurnView, tool groups, subagent cards, notice rows, the preview
// turn path, selector rows) over inline fixtures — no server data. Each section
// runs its turns through the same groupTurns + interleaveNotices pipeline as
// ChatPanel, so restyling the chat can happen by looking at this one page and
// the page stays truthful as components evolve.
import { type ReactNode, useEffect } from 'react'

import { IconChevronDown } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/client/components/ui/dropdown-menu'
import { ChatEmptyState } from '@/client/features/chat/ChatEmptyState'
import { ChatErrorBanner, ChatNoticeRow } from '@/client/features/chat/ChatPanel'
import { ChatSessionItem } from '@/client/features/chat/ChatSelector'
import { ThinkingIndicator, TurnView } from '@/client/features/chat/TurnView'
import { isSessionRunning, liveStore } from '@/client/features/chat/chat-store'
import { groupTurns } from '@/client/features/chat/group-turns'
import { interleaveNotices } from '@/client/features/chat/interleave-notices'
import { buildPreviewTurn } from '@/client/features/chat/preview-turn'
import {
  WorkspaceLayoutContext,
  type WorkspaceLayoutContextValue
} from '@/client/features/workspace/WorkspaceLayoutContext'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import type { SystemNotice, Turn } from '@/lib/types'

import {
  DEV_CWD,
  DEV_WORKSPACE_ID,
  RUNNING_SELECTOR_SESSION_ID,
  approvalDenied,
  approvalPending,
  assistantReasoningFirst,
  assistantRichMarkdown,
  assistantWithMeta,
  busyPrompt,
  chatError,
  compactNotice,
  execError,
  execPending,
  execRunning,
  execSuccess,
  mcpGithubGetMe,
  messageTool,
  modelChangeNotice,
  modelChangeNoticeNoPrev,
  readSuccess,
  reasoningStreamPreview,
  runFailureTurn,
  selectorSessions,
  skillRow,
  streamPrompt,
  subagentCompleted,
  subagentFailed,
  subagentRunning,
  textStreamPreview,
  toLivePreview,
  toolMergeTurns,
  userChannelRouted,
  userFileAttachment,
  userImageAttachment,
  userLongMarkdown,
  userShort,
  writeSuccess
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

const GROUPS = [
  { id: 'turns', title: 'Turns' },
  { id: 'tool-calls', title: 'Tool calls' },
  { id: 'subagents', title: 'Subagents' },
  { id: 'streaming', title: 'Streaming' },
  { id: 'notices', title: 'Notices' },
  { id: 'errors', title: 'Errors and edge states' },
  { id: 'selector', title: 'Chat selector rows' }
] as const

type TranscriptProps = {
  turns: Turn[]
  notices?: SystemNotice[]
  previewTurn?: Turn | null
  processing?: boolean
}

// Mirrors ChatPanel's timeline: append the preview turn, fold tool-only turns
// (groupTurns), weave notices in, then map to the real row components. The
// pulsing dots appear exactly when ChatPanel shows them — processing with no
// preview content yet.
function Transcript({
  turns,
  notices = [],
  previewTurn = null,
  processing = false
}: TranscriptProps) {
  const grouped = groupTurns(previewTurn ? [...turns, previewTurn] : turns)
  const timeline = interleaveNotices(grouped, notices)
  const lastTurnId = grouped.length > 0 ? grouped[grouped.length - 1].id : null
  return (
    <div className="flex w-full flex-col gap-6">
      {timeline.map(item =>
        item.kind === 'notice' ? (
          <ChatNoticeRow key={`notice:${item.notice.id}`} notice={item.notice} />
        ) : (
          <TurnView
            key={item.turn.id}
            turn={item.turn}
            processing={processing && item.turn.id === lastTurnId}
          />
        )
      )}
      {processing && !previewTurn && <ThinkingIndicator />}
    </div>
  )
}

type SectionProps = { label: string; note?: string; children: ReactNode }

function Section({ label, note, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
        {note && <p className="max-w-prose text-xs text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  )
}

type GroupProps = { id: string; title: string; children: ReactNode }

function Group({ id, title, children }: GroupProps) {
  return (
    <div id={id} className="flex scroll-mt-8 flex-col gap-8 border-t border-border pt-8">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </div>
  )
}

function noop() {}
async function asyncNoop() {}

// The selector menu held open over reserved space, composed from the same
// primitives ChatSelector uses, with the real ChatSessionItem rows inside.
function SelectorShowcase() {
  return (
    <div className="flex flex-col">
      <div>
        <DropdownMenu open modal={false}>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost">
                <span className="max-w-64 truncate">Fix the layout save race</span>
                <IconChevronDown stroke={1.5} />
              </Button>
            }
          />
          <DropdownMenuContent
            align="start"
            className="flex max-h-100 w-max max-w-72 min-w-40 flex-col overflow-hidden"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>Today</DropdownMenuLabel>
              {selectorSessions.map(session => (
                <ChatSessionItem
                  key={session.sessionId}
                  session={session}
                  active={session.sessionId === selectorSessions[0].sessionId}
                  // The archive affordance replaces the running spinner on
                  // hover/touch, so the running row keeps archiving off to
                  // show the pure spinner treatment.
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
      </div>
      {/* The open menu portals over this reserved space. */}
      <div aria-hidden className="h-64" />
    </div>
  )
}

export function ChatStatesPage() {
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

  return (
    <WorkspaceLayoutContext value={layoutCtxValue}>
      <div className="min-h-dvh bg-background font-sans text-foreground">
        <div className="mx-auto flex w-full max-w-5xl gap-10 px-6 py-10">
          <nav className="sticky top-10 hidden h-fit w-40 shrink-0 flex-col gap-1.5 self-start xl:flex">
            <span className="pb-1 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
              Contents
            </span>
            {GROUPS.map(group => (
              <a
                key={group.id}
                href={`#${group.id}`}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {group.title}
              </a>
            ))}
          </nav>

          <main className="flex w-full max-w-(--chat-max-container) min-w-0 flex-1 flex-col gap-8">
            <header className="flex flex-col gap-1">
              <span className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                Playground / Chat states
              </span>
              <p className="text-sm text-muted-foreground">
                Every chat state, rendered by the production components over inline fixtures on the
                normal chat background.
              </p>
            </header>

            <Group id="turns" title="Turns">
              <Section label="User turn — short text">
                <Transcript turns={[userShort]} />
              </Section>
              <Section
                label="User turn — long markdown"
                note="User bubbles keep the text verbatim — fences and blank lines render as typed."
              >
                <Transcript turns={[userLongMarkdown]} />
              </Section>
              <Section
                label="User turn — channel-routed message"
                note="Arrived over IRC (session origin { provider: 'irc', label: 'mole!mole@127.0.0.1' }). The gateway's inbound metadata envelope is stripped at the adapter, so the turn reads as plain input."
              >
                <Transcript turns={[userChannelRouted]} />
              </Section>
              <Section label="Assistant turn — rich markdown">
                <Transcript turns={[assistantRichMarkdown]} />
              </Section>
              <Section
                label="Assistant turn — with usage meta"
                note="Carries meta { model: 'claude-sonnet-5', provider: 'anthropic', stopReason: 'stop', usage { 4 in / 151 out / 41811 total / $0.1129 } }. The transcript does not render meta yet — it rides on the turn for future treatments."
              >
                <Transcript turns={[assistantWithMeta]} />
              </Section>
              <Section label="Assistant turn — reasoning then text">
                <Transcript turns={[assistantReasoningFirst]} />
              </Section>
              <Section
                label="Consecutive tool-only turns — merged"
                note="Three assistant turns off the wire; the two tool-only ones fold into a single group (group-turns), so the rail reads as one run."
              >
                <Transcript turns={toolMergeTurns} />
              </Section>
              <Section label="User turn — image attachment">
                <Transcript turns={[userImageAttachment]} />
              </Section>
              <Section label="User turn — file attachment">
                <Transcript turns={[userFileAttachment]} />
              </Section>
            </Group>

            <Group id="tool-calls" title="Tool calls">
              <Section label="Tool call — exec pending">
                <Transcript turns={[execPending]} processing />
              </Section>
              <Section
                label="Tool call — exec running"
                note="Pending and running render alike today: spinner node, no output body."
              >
                <Transcript turns={[execRunning]} processing />
              </Section>
              <Section label="Tool call — exec success" note="Click the row to expand the output.">
                <Transcript turns={[execSuccess]} />
              </Section>
              <Section label="Tool call — exec error">
                <Transcript turns={[execError]} />
              </Section>
              <Section label="Tool call — read success">
                <Transcript turns={[readSuccess]} />
              </Section>
              <Section label="Tool call — write success">
                <Transcript turns={[writeSuccess]} />
              </Section>
              <Section label="Tool call — MCP (GitHub)">
                <Transcript turns={[mcpGithubGetMe]} />
              </Section>
              <Section label="Tool call — skill row">
                <Transcript turns={[skillRow]} />
              </Section>
              <Section label="Tool call — approval pending">
                <Transcript turns={[approvalPending]} />
              </Section>
              <Section label="Tool call — approval denied">
                <Transcript turns={[approvalDenied]} />
              </Section>
              <Section label="Tool call — message tool">
                <Transcript turns={[messageTool]} />
              </Section>
            </Group>

            <Group id="subagents" title="Subagents">
              <Section label="Subagent — running">
                <Transcript turns={[subagentRunning]} processing />
              </Section>
              <Section
                label="Subagent — completed"
                note="Expand the card for the nested transcript and the final summary."
              >
                <Transcript turns={[subagentCompleted]} />
              </Section>
              <Section label="Subagent — failed">
                <Transcript turns={[subagentFailed]} />
              </Section>
            </Group>

            <Group id="streaming" title="Streaming">
              <Section
                label="Streaming — text preview"
                note="A live PreviewFrame rendered through the real preview-turn path (buildPreviewTurn → groupTurns)."
              >
                <Transcript
                  turns={[streamPrompt]}
                  previewTurn={buildPreviewTurn(toLivePreview(textStreamPreview))}
                  processing
                />
              </Section>
              <Section label="Streaming — live thinking">
                <Transcript
                  turns={[streamPrompt]}
                  previewTurn={buildPreviewTurn(toLivePreview(reasoningStreamPreview))}
                  processing
                />
              </Section>
              <Section label="Streaming — busy, no preview yet">
                <Transcript turns={[busyPrompt]} processing />
              </Section>
            </Group>

            <Group id="notices" title="Notices">
              <Section label="Notice — context compacted">
                <Transcript turns={[]} notices={[compactNotice]} />
              </Section>
              <Section label="Notice — model change">
                <Transcript turns={[]} notices={[modelChangeNotice, modelChangeNoticeNoPrev]} />
              </Section>
            </Group>

            <Group id="errors" title="Errors and edge states">
              <Section
                label="Chat error banner"
                note="Sits above the composer inside the tinted group; the copy comes from the chat-store errors slice."
              >
                <div className="flex w-full flex-col gap-2 rounded-t-xl rounded-b-2xl bg-destructive/10 p-2">
                  <ChatErrorBanner error={chatError} onDismiss={noop} />
                </div>
              </Section>
              <Section
                label="Run failure turn"
                note="Gateways report a failed run as a plain assistant turn."
              >
                <Transcript turns={[runFailureTurn]} />
              </Section>
              <Section label="Empty chat — placeholder">
                <div className="flex min-h-32 flex-col">
                  <ChatEmptyState kind="empty" onSelectPrompt={noop} />
                </div>
              </Section>
              <Section label="Empty chat — first-run welcome">
                <div className="flex flex-col">
                  <ChatEmptyState kind="chat-welcome" onSelectPrompt={noop} />
                </div>
              </Section>
            </Group>

            <Group id="selector" title="Chat selector rows">
              <Section
                label="Selector menu — row variants"
                note="Plain (active), cron badge, subagent badge, channel origin badge, and a running chat with its spinner. Hover a row for the archive affordance."
              >
                <SelectorShowcase />
              </Section>
            </Group>
          </main>
        </div>
      </div>
    </WorkspaceLayoutContext>
  )
}
