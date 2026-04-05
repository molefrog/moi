import { useCallback, useEffect, useState } from 'react'

import { IconChevronDown, IconPlus } from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'
import type { SessionInfo } from '@/lib/types'

import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/_mei/sessions')
      const data: SessionInfo[] = await res.json()
      setSessions(data)
      if (!activeId && data.length > 0) setActiveId(data[0].sessionId)
    } catch {}
  }, [activeId])

  useEffect(() => {
    fetchSessions()
  }, [])

  const active = sessions.find(s => s.sessionId === activeId)
  const label = active?.summary ?? 'New thread'

  function handleSelect(sessionId: string | null) {
    setActiveId(sessionId)
    onSwitch(sessionId)
  }

  return (
    <DropdownMenu onOpenChange={open => open && fetchSessions()}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="-ml-2">
            <span className="max-w-64 truncate">{label}</span>
            <IconChevronDown stroke={1.5} className="text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="max-h-80 w-80 overflow-y-auto">
        <DropdownMenuItem onClick={() => handleSelect(null)}>
          <IconPlus size={16} stroke={1.5} />
          New thread
        </DropdownMenuItem>
        {sessions.length > 0 && <DropdownMenuSeparator />}
        {sessions.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Recent</DropdownMenuLabel>
            {sessions.map(s => (
              <DropdownMenuItem
                key={s.sessionId}
                className={cn(activeId === s.sessionId && 'bg-accent')}
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
