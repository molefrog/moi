import { IconChevronDown, IconPlus } from '@tabler/icons-react'

import { useWorkspaceSessions } from '@/client/api/workspaces'
import { useWorkspaceId } from '@/client/lib/WorkspaceContext'
import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/store/live'

import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

type ThreadSelectorProps = {
  onSwitch: (sessionId: string | null) => void
}

function formatDate(ms: number) {
  const date = new Date(ms)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  if (isToday) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (isYesterday) return 'Yesterday'
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function ThreadSelector({ onSwitch }: ThreadSelectorProps) {
  const workspaceId = useWorkspaceId()
  const { data: sessions = [], refetch } = useWorkspaceSessions(workspaceId)
  const activeSessionId = useLive(s => s.activeByWorkspace[workspaceId] ?? null)

  const active = sessions.find(s => s.sessionId === activeSessionId)
  const label = active?.summary ?? 'New thread'

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
      <DropdownMenuContent align="start" className="max-h-80 w-80 overflow-y-auto">
        <DropdownMenuItem
          className="text-muted-foreground! **:text-muted-foreground!"
          onClick={() => handleSelect(null)}
        >
          <IconPlus size={16} stroke={1.75} />
          New thread
        </DropdownMenuItem>
        {sessions.length > 0 && (
          <DropdownMenuGroup>
            {sessions.map(s => (
              <DropdownMenuItem
                key={s.sessionId}
                className={cn(
                  activeSessionId === s.sessionId && 'bg-accent text-accent-foreground'
                )}
                onClick={() => handleSelect(s.sessionId)}
              >
                <span className="truncate">{s.summary}</span>
                <DropdownMenuShortcut className="shrink-0 tracking-normal">
                  {formatDate(s.lastModified)}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
