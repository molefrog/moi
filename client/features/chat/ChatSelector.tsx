import { type MouseEvent, useRef, useState } from 'react'
import { IconArchive, IconChevronDown, IconEdit } from '@tabler/icons-react'

import { useArchiveWorkspaceSession, useWorkspaceModels, useWorkspaceSessions } from './api'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import { cn } from '@/client/lib/cn'
import {
  hasRunningWorkspaceActivity,
  isRunningActivity,
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
  onArchive: (sessionId: string) => Promise<void>
  onSelect: (sessionId: string) => void
  session: SessionInfo
  workspaceId: string
}

function ChatSessionItem({
  active,
  canArchive,
  onArchive,
  onSelect,
  session,
  workspaceId
}: ChatSessionItemProps) {
  const pendingRef = useRef(false)
  const [pending, setPending] = useState(false)
  const running = useLive(state =>
    isRunningActivity(state.activity[`${workspaceId}:${session.sessionId}`])
  )

  async function handleArchive(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
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
        className={cn(active && 'bg-accent text-accent-foreground')}
        onClick={() => onSelect(session.sessionId)}
      >
        <div
          className={cn(
            'flex min-w-0 flex-1 overflow-hidden',
            (running || pending) && 'mr-4 mask-r-from-[calc(100%-16px)]',
            canArchive &&
              'group-focus-within/chat:mr-4 group-focus-within/chat:mask-r-from-[calc(100%-16px)] [@media(hover:none)]:mr-4 [@media(hover:none)]:mask-r-from-[calc(100%-16px)]'
          )}
        >
          <span
            className={cn(
              'min-w-0 truncate',
              (running || pending) && '-mr-4',
              canArchive && 'group-focus-within/chat:-mr-4 [@media(hover:none)]:-mr-4'
            )}
          >
            {session.summary}
          </span>
        </div>
        {running && (
          <Spinner
            className={cn(
              'pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground',
              canArchive && 'group-focus-within/chat:hidden [@media(hover:none)]:hidden',
              pending && 'hidden'
            )}
          />
        )}
        {canArchive && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Archive ${session.summary}`}
                  tabIndex={-1}
                  className={cn(
                    'absolute top-1/2 right-0 -translate-y-1/2 text-muted-foreground opacity-100 transition-none',
                    'group-focus-within/chat:opacity-100 group-hover/chat:opacity-100 hover:bg-transparent hover:text-foreground [@media(hover:hover)]:opacity-0',
                    pending && 'opacity-100!'
                  )}
                  disabled={pending}
                  onClick={handleArchive}
                  onPointerDown={event => event.stopPropagation()}
                >
                  <IconArchive stroke={1.75} />
                </Button>
              }
            />
            <TooltipContent side="right">Archive</TooltipContent>
          </Tooltip>
        )}
      </DropdownMenuItem>
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
  const { data: sessions = [], refetch } = useWorkspaceSessions(workspaceId)
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

  async function handleArchive(sessionId: string) {
    await archiveSession.mutateAsync(sessionId)
    const store = liveStore.getState()
    store.clearAttachments(workspaceId, sessionId)
    store.clearPreviewsForSession(workspaceId, sessionId)
    if (selectedSessionId === sessionId) {
      onSelectSession(null)
    }
  }

  return (
    <DropdownMenu
      onOpenChange={open => {
        if (open) refetch()
      }}
    >
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
          className="shrink-0 text-muted-foreground! **:text-muted-foreground!"
          onClick={() => handleSelect(null)}
        >
          <IconEdit size={16} stroke={1.75} />
          New chat
        </DropdownMenuItem>
        {sessionGroups.length > 0 && (
          <>
            <DropdownMenuSeparator className="shrink-0" />
            <div className="no-scrollbar min-h-0 flex-1 scroll-fade overflow-y-auto overscroll-contain [--scroll-fade-reveal:8px]">
              {sessionGroups.map(group => (
                <DropdownMenuGroup key={group.key}>
                  <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                  {group.sessions.map(session => (
                    <ChatSessionItem
                      key={session.sessionId}
                      session={session}
                      active={selectedSessionId === session.sessionId}
                      canArchive={canArchive}
                      onSelect={handleSelect}
                      onArchive={handleArchive}
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
