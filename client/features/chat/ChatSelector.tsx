import { IconChevronDown, IconEdit } from '@tabler/icons-react'

import { useWorkspaceSessions } from './api'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/features/chat/chat-store'
import type { SessionInfo } from '@/lib/types'

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

type ChatSelectorProps = {
  onSwitch: (sessionId: string | null) => void
}

type ChatSessionGroup = {
  key: string
  label: string
  sessions: SessionInfo[]
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

export function ChatSelector({ onSwitch }: ChatSelectorProps) {
  const workspaceId = useWorkspaceId()
  const { data: sessions = [], refetch } = useWorkspaceSessions(workspaceId)
  const activeSessionId = useLive(s => s.activeByWorkspace[workspaceId] ?? null)

  const active = sessions.find(s => s.sessionId === activeSessionId)
  const label = active?.summary ?? 'New chat'
  const sessionGroups = groupSessionsByDate(sessions)

  function handleSelect(sessionId: string | null) {
    onSwitch(sessionId)
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
            <IconChevronDown stroke={1.5} />
          </Button>
        }
      />
      <DropdownMenuContent
        align="start"
        className="max-h-100 w-max max-w-72 min-w-40 overflow-y-auto"
      >
        <DropdownMenuItem
          className="text-muted-foreground! **:text-muted-foreground!"
          onClick={() => handleSelect(null)}
        >
          <IconEdit size={16} stroke={1.75} />
          New chat
        </DropdownMenuItem>
        {sessionGroups.length > 0 && <DropdownMenuSeparator />}
        {sessionGroups.map(group => (
          <DropdownMenuGroup key={group.key}>
            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
            {group.sessions.map(session => (
              <DropdownMenuItem
                key={session.sessionId}
                className={cn(
                  activeSessionId === session.sessionId && 'bg-accent text-accent-foreground'
                )}
                onClick={() => handleSelect(session.sessionId)}
              >
                <span className="truncate">{session.summary}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
