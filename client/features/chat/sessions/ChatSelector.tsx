import { useRef, useState } from 'react'
import { IconArchive, IconEdit, IconHistory, IconPin, IconPinFilled } from '@tabler/icons-react'

import { useArchiveWorkspaceSession, useWorkspaceSessions } from './api'
import { useWorkspaceAgent } from '@/client/features/workspace/api'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import {
  useSelectedSession,
  useCurrentTabId,
  usePinnedSession
} from '@/client/features/chat/sessions/useSelectedSession'
import { cn } from '@/client/lib/cn'
import { isSessionRunning, liveStore, useLive } from '@/client/features/chat/chat-store'
import type { SessionInfo, WorkspaceTabId } from '@/lib/types'

import { Button } from '@/client/components/ui/button'
import { toast } from '@/client/components/ui/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/client/components/ui/dropdown-menu'
import { Spinner } from '@/client/components/ui/spinner'

type ChatSelectorProps = {
  className?: string
}

type SessionSelectorProps = ChatSelectorProps & {
  sessions: SessionInfo[]
}

type ChatSessionGroup = {
  key: string
  label: string
  sessions: SessionInfo[]
}

// One tiny text badge per row at most: a cron/subagent flavor wins; otherwise
// an external origin shows its provider lowercase (e.g. "irc", "telegram").
// Plain app chats get none.
export function sessionBadge(session: SessionInfo): string | null {
  if (session.flavor === 'cron' || session.flavor === 'subagent') return session.flavor
  const provider = session.origin?.provider.trim().toLowerCase()
  return provider ? provider : null
}

type ChatSessionItemProps = {
  active: boolean
  canArchive: boolean
  confirmingArchive: boolean
  onArchive: (sessionId: string) => Promise<void>
  onRequestArchive: (sessionId: string) => void
  onSelect: (sessionId: string) => void
  session: SessionInfo
  workspaceId: string
}

// One chat row inside the selector menu (summary, flavor/origin badge, running
// spinner, archive affordance). Exported for the /dev/chat-states catalog.
export function ChatSessionItem({
  active,
  canArchive,
  confirmingArchive,
  onArchive,
  onRequestArchive,
  onSelect,
  session,
  workspaceId
}: ChatSessionItemProps) {
  const pendingRef = useRef(false)
  const [pending, setPending] = useState(false)
  const running = useLive(state => isSessionRunning(state.activity, workspaceId, session.sessionId))
  const badge = sessionBadge(session)

  function handleRequestArchive() {
    onRequestArchive(session.sessionId)
  }

  async function handleConfirmArchive() {
    if (pendingRef.current) return

    pendingRef.current = true
    setPending(true)
    try {
      await onArchive(session.sessionId)
    } catch {
      toast.add({ title: 'Couldn’t archive chat', type: 'error' })
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  return (
    <div className="group/chat relative">
      <DropdownMenuItem
        className={cn(
          'font-medium group-hover/chat:bg-accent group-hover/chat:text-accent-foreground',
          active && 'bg-accent text-accent-foreground'
        )}
        onClick={() => onSelect(session.sessionId)}
      >
        <div
          className={cn(
            'flex min-w-0 flex-1 overflow-hidden',
            (running || pending) && 'mr-4 mask-r-from-[calc(100%-16px)]',
            canArchive &&
              !confirmingArchive &&
              'group-focus-within/chat:mr-4 group-focus-within/chat:mask-r-from-[calc(100%-16px)] group-hover/chat:mr-4 group-hover/chat:mask-r-from-[calc(100%-16px)] [@media(hover:none)]:mr-4 [@media(hover:none)]:mask-r-from-[calc(100%-16px)]',
            confirmingArchive && 'mr-14 mask-r-from-[calc(100%-16px)]'
          )}
        >
          <span
            className={cn(
              'flex min-w-0 items-baseline gap-1.5',
              (running || pending) && '-mr-4',
              confirmingArchive
                ? '-mr-14'
                : canArchive &&
                    'group-focus-within/chat:-mr-4 group-hover/chat:-mr-4 [@media(hover:none)]:-mr-4'
            )}
          >
            <span className="min-w-0 truncate">{session.summary}</span>
            {badge && <span className="shrink-0 text-xs text-muted-foreground">{badge}</span>}
          </span>
        </div>
      </DropdownMenuItem>
      {running && (
        <Spinner
          className={cn(
            'pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground',
            canArchive &&
              'group-focus-within/chat:hidden group-hover/chat:hidden [@media(hover:none)]:hidden',
            (confirmingArchive || pending) && 'hidden'
          )}
        />
      )}
      {canArchive && (
        <div
          className={cn(
            'absolute top-1/2 right-0 flex -translate-y-1/2 items-center opacity-100 transition-none',
            !confirmingArchive &&
              'group-focus-within/chat:opacity-100 group-hover/chat:opacity-100 [@media(hover:hover)]:opacity-0',
            pending && 'opacity-100!'
          )}
        >
          {confirmingArchive ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label={`Confirm archive ${session.summary}`}
              tabIndex={-1}
              className="mr-1 h-5 rounded-sm px-1.5 text-xs hover:bg-accent"
              disabled={pending}
              onClick={handleConfirmArchive}
              onPointerDown={event => event.stopPropagation()}
            >
              Confirm
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Archive ${session.summary}`}
                    tabIndex={-1}
                    className="text-muted-foreground hover:bg-transparent hover:text-foreground"
                    disabled={pending}
                    onClick={handleRequestArchive}
                    onPointerDown={event => event.stopPropagation()}
                  >
                    <IconArchive stroke={1.75} />
                  </Button>
                }
              />
              <TooltipContent side="right">Archive chat</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  )
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function calendarDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
}

function formatGroupLabel(date: Date, now: Date): string {
  const daysAgo = calendarDayNumber(now) - calendarDayNumber(date)
  if (daysAgo === 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  if (daysAgo >= 2 && daysAgo <= 5) return `${daysAgo} days ago`

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
  })
}

export function groupSessionsByDate(sessions: SessionInfo[], now = new Date()): ChatSessionGroup[] {
  const groups = new Map<string, ChatSessionGroup>()

  for (const session of sessions.slice().sort((a, b) => b.lastModified - a.lastModified)) {
    const date = new Date(session.lastModified)
    const key = localDateKey(date)
    const group = groups.get(key)
    if (group) {
      group.sessions.push(session)
      continue
    }
    groups.set(key, {
      key,
      label: formatGroupLabel(date, now),
      sessions: [session]
    })
  }

  return [...groups.values()]
}

export function groupSessionsForTab(
  sessions: SessionInfo[],
  tabId: WorkspaceTabId,
  now = new Date()
): ChatSessionGroup[] {
  return groupSessionsByDate(
    sessions.filter(session =>
      tabId === 'overview' ? !session.tabId?.startsWith('views/') : session.tabId === tabId
    ),
    now
  )
}

export function ChatSelector({ className }: ChatSelectorProps) {
  const workspaceId = useWorkspaceId()
  const { pinnedSessionId, loaded, pin } = usePinnedSession()
  const [selectedSessionId] = useSelectedSession()
  const { data: sessions = [] } = useWorkspaceSessions(workspaceId)
  if (!loaded) return null

  if (pinnedSessionId) {
    const title = sessions.find(session => session.sessionId === pinnedSessionId)?.summary
    if (!title) return null
    return (
      <div
        className={cn(
          '-my-0.5 -ml-0.5 box-content h-7 max-w-56 rounded-lg py-0.5 pr-0.5 pl-3',
          'flex min-w-0 items-center gap-1 bg-accent text-sm font-medium'
        )}
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <Tooltip key="unpin">
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className={className}
                onClick={() => pin(null)}
                aria-label="Unpin chat"
                aria-pressed={true}
              >
                <IconPinFilled stroke={1.75} />
              </Button>
            }
          />
          <TooltipContent>Unpin chat</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-1">
      <SessionSelector className={className} sessions={sessions} />
      {selectedSessionId && (
        <Tooltip key="pin">
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className={className}
                onClick={() => pin(selectedSessionId)}
                aria-label="Pin chat to workspace"
                aria-pressed={false}
              >
                <IconPin stroke={1.75} />
              </Button>
            }
          />
          <TooltipContent>Pin chat to workspace</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

function SessionSelector({ className, sessions }: SessionSelectorProps) {
  const workspaceId = useWorkspaceId()
  const tabId = useCurrentTabId()
  const [selectedSessionId, selectSession] = useSelectedSession()
  const [confirmingSessionId, setConfirmingSessionId] = useState<string | null>(null)
  const canArchive = useWorkspaceAgent(workspaceId).data?.supportsArchiving === true
  const archiveSession = useArchiveWorkspaceSession(workspaceId)
  const sessionGroups = groupSessionsForTab(sessions, tabId)

  if (sessionGroups.length === 0 && !selectedSessionId) return null

  function handleMenuOpenChange(open: boolean) {
    if (!open) setConfirmingSessionId(null)
  }

  async function handleArchive(sessionId: string) {
    setConfirmingSessionId(null)
    await archiveSession.mutateAsync(sessionId)
    const store = liveStore.getState()
    store.clearAttachments(workspaceId, sessionId)
    store.clearPreviewsForSession(workspaceId, sessionId)
    if (selectedSessionId === sessionId) {
      selectSession(null)
    }
  }

  return selectedSessionId ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="New chat"
            onClick={() => selectSession(null)}
            className={className}
          >
            <IconEdit stroke={1.75} />
          </Button>
        }
      />
      <TooltipContent>New chat</TooltipContent>
    </Tooltip>
  ) : (
    <DropdownMenu onOpenChange={handleMenuOpenChange}>
      <Tooltip>
        <DropdownMenuTrigger
          render={
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="History" className={className}>
                  <IconHistory stroke={1.75} />
                </Button>
              }
            />
          }
        />
        <TooltipContent>History</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        className="flex max-h-100 w-max max-w-72 min-w-40 flex-col overflow-hidden"
      >
        <div className="no-scrollbar flex min-h-0 flex-1 scroll-fade flex-col gap-1 overflow-y-auto overscroll-contain [--scroll-fade-reveal:8px]">
          {sessionGroups.map(group => (
            <DropdownMenuGroup key={group.key}>
              <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
              {group.sessions.map(session => (
                <ChatSessionItem
                  key={session.sessionId}
                  session={session}
                  active={selectedSessionId === session.sessionId}
                  canArchive={canArchive}
                  confirmingArchive={confirmingSessionId === session.sessionId}
                  onSelect={selectSession}
                  onArchive={handleArchive}
                  onRequestArchive={setConfirmingSessionId}
                  workspaceId={workspaceId}
                />
              ))}
            </DropdownMenuGroup>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
