import { useRef, useState } from 'react'
import { IconArchive, IconChevronDown, IconEdit } from '@tabler/icons-react'

import { useArchiveWorkspaceSession, useWorkspaceModels, useWorkspaceSessions } from './api'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import { cn } from '@/client/lib/cn'
import {
  hasRunningWorkspaceActivity,
  isSessionRunning,
  liveStore,
  useLive
} from '@/client/features/chat/chat-store'
import type { SessionInfo } from '@/lib/types'

import { Button } from '@/client/components/ui/button'
import { toast } from '@/client/components/ui/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/client/components/ui/dropdown-menu'
import { Spinner } from '@/client/components/ui/spinner'

type ChatSelectorProps = {
  onSelectSession: (sessionId: string | null) => void
  selectedSessionId: string | null
}

type ChatSessionGroup = {
  key: string
  label: string
  sessions: SessionInfo[]
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

function ChatSessionItem({
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
              'min-w-0 truncate',
              (running || pending) && '-mr-4',
              confirmingArchive
                ? '-4'
                : canArchive &&
                    'group-focus-within/chat:-mr-4 group-hover/chat:-mr-4 [@media(hover:none)]:-mr-4'
            )}
          >
            {session.summary}
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
              <TooltipContent side="right">Archive</TooltipContent>
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

export function ChatSelector({ onSelectSession, selectedSessionId }: ChatSelectorProps) {
  const workspaceId = useWorkspaceId()
  const [confirmingSessionId, setConfirmingSessionId] = useState<string | null>(null)
  const { data: sessions = [] } = useWorkspaceSessions(workspaceId)
  const canArchive = useWorkspaceModels(workspaceId).data?.supportsArchiving === true
  const archiveSession = useArchiveWorkspaceSession(workspaceId)
  const hasRunningSession = useLive(state =>
    hasRunningWorkspaceActivity(state.activity, workspaceId)
  )
  const active = sessions.find(s => s.sessionId === selectedSessionId)
  const label = active?.summary ?? 'New chat'
  const sessionGroups = groupSessionsByDate(sessions)

  function handleSelect(sessionId: string | null) {
    onSelectSession(sessionId)
  }

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
      onSelectSession(null)
    }
  }

  return (
    <DropdownMenu onOpenChange={handleMenuOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost">
            <span className="max-w-64 truncate">{label}</span>
            {hasRunningSession ? (
              <Spinner className="size-4!" stroke={2} />
            ) : (
              <IconChevronDown data-icon="inline-end" stroke={1.5} />
            )}
          </Button>
        }
      />
      <DropdownMenuContent
        align="start"
        className="flex max-h-100 w-max max-w-72 min-w-40 flex-col overflow-hidden"
      >
        <DropdownMenuItem
          className="shrink-0 gap-1 font-medium text-muted-foreground! **:text-muted-foreground!"
          onClick={() => handleSelect(null)}
        >
          <IconEdit size={16} stroke={1.75} />
          New chat
        </DropdownMenuItem>
        {sessionGroups.length > 0 && (
          <>
            <DropdownMenuSeparator className="shrink-0" />
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
                      onSelect={handleSelect}
                      onArchive={handleArchive}
                      onRequestArchive={setConfirmingSessionId}
                      workspaceId={workspaceId}
                    />
                  ))}
                </DropdownMenuGroup>
              ))}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
