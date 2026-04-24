import { useEffect, useState } from 'react'

import { IconClockHour4, IconDots, IconLoader2, IconPlus } from '@tabler/icons-react'
import { Link } from 'wouter'

import { cn } from '@/client/lib/cn'
import type { WorkspaceEntry } from '@/lib/types'

type PageState = 'loading' | 'ready' | 'error'

export function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([])
  const [discovered, setDiscovered] = useState<string[]>([])
  const [state, setState] = useState<PageState>('loading')
  const [importing, setImporting] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/workspaces').then(r => r.json()),
      fetch('/api/workspaces/discover').then(r => r.json())
    ])
      .then(([ws, disc]) => {
        setWorkspaces(ws)
        setDiscovered(disc)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])

  async function importWorkspace(path: string) {
    setImporting(path)
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      })
      const entry: WorkspaceEntry = await res.json()
      setWorkspaces(prev => [...prev, entry])
      setDiscovered(prev => prev.filter(p => p !== path))
    } finally {
      setImporting(null)
    }
  }

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <IconLoader2 size={20} stroke={1.5} className="text-muted-foreground animate-spin" />
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Could not load workspaces.</p>
      </div>
    )
  }

  const count = workspaces.length

  return (
    <div className="mx-auto w-full max-w-3xl px-8 pb-16 pt-14">
      <header className="mb-10 flex flex-col gap-1.5">
        <h1 className="text-foreground text-[22px] font-semibold tracking-tight">Workspaces</h1>
        <p className="text-muted-foreground text-[14px]">
          {count} connected workspace{count === 1 ? '' : 's'}
        </p>
      </header>

      {count > 0 && (
        <div className="mb-10 grid grid-cols-2 gap-3">
          {workspaces.map(ws => (
            <WorkspaceCard key={ws.id} workspace={ws} />
          ))}
        </div>
      )}

      {count === 0 && discovered.length === 0 && (
        <p className="text-muted-foreground mb-10 text-sm">
          No workspaces yet. Run{' '}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">moi start</code> in a
          project directory.
        </p>
      )}

      {discovered.length > 0 && (
        <section>
          <div className="mb-4">
            <h2 className="text-foreground mb-1.5 text-[15px] font-semibold">
              Found on your machine
            </h2>
            <p className="text-muted-foreground text-[13px]">
              Discovered via{' '}
              <span className="text-foreground/70 font-mono text-[12px]">~/.claude/projects</span>
            </p>
          </div>
          <ul className="border-border border-t">
            {discovered.map(path => (
              <SuggestedRow
                key={path}
                path={path}
                onAdd={importWorkspace}
                loading={importing === path}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

type WorkspaceCardProps = {
  workspace: WorkspaceEntry
}

function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const name = workspace.path.split('/').pop() || workspace.path
  const meta = formatAddedAt(workspace.addedAt)

  return (
    <Link
      href={`/workspace/${workspace.id}`}
      className={cn(
        'border-border bg-card hover:bg-muted/40 group flex gap-3.5 rounded-xl border p-3.5',
        'transition-colors'
      )}
    >
      <PreviewSkeleton />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <IconClockHour4 size={14} stroke={1.8} className="shrink-0 text-[#C96B3F]" />
            <span className="text-foreground truncate text-[15px] font-semibold tracking-[-0.005em]">
              {name}
            </span>
          </div>
          <button
            type="button"
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
            }}
            className="text-muted-foreground hover:bg-muted flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md"
            aria-label="More actions"
          >
            <IconDots size={14} stroke={2} />
          </button>
        </div>
        <div className="text-muted-foreground truncate font-mono text-[11px]">{workspace.path}</div>
        <div className="flex-1" />
        <div className="text-muted-foreground text-[11px]">{meta}</div>
      </div>
    </Link>
  )
}

function PreviewSkeleton() {
  return (
    <div className="bg-muted flex h-[92px] w-[92px] shrink-0 flex-col gap-[5px] rounded-lg p-2">
      <div className="flex h-2 items-center gap-1">
        <div className="bg-muted-foreground/25 h-2 w-2 rounded-full" />
        <div className="bg-muted-foreground/25 h-1 flex-1 rounded-[2px]" />
      </div>
      <div className="flex flex-1 gap-[5px]">
        <div className="flex w-[18px] flex-col gap-[3px]">
          <div className="bg-muted-foreground/25 h-1 w-full rounded-[2px]" />
          <div className="bg-muted-foreground/25 h-1 w-full rounded-[2px]" />
          <div className="bg-muted-foreground/15 h-1 w-full rounded-[2px]" />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex gap-1">
            <div className="bg-muted-foreground/25 h-3.5 flex-[2] rounded-[3px]" />
            <div className="bg-muted-foreground/15 h-3.5 flex-1 rounded-[3px]" />
          </div>
          <div className="bg-muted-foreground/15 h-[18px] rounded-[3px]" />
          <div className="bg-foreground/10 h-2.5 rounded-[3px]" />
        </div>
      </div>
    </div>
  )
}

type SuggestedRowProps = {
  path: string
  onAdd: (path: string) => void
  loading: boolean
}

function SuggestedRow({ path, onAdd, loading }: SuggestedRowProps) {
  const name = path.split('/').pop() || path
  return (
    <li className="border-border flex items-center gap-3 border-b px-1 py-2.5">
      <IconClockHour4 size={14} stroke={1.8} className="shrink-0 text-[#C96B3F]/70" />
      <span className="text-foreground/80 shrink-0 text-[13px] font-medium">{name}</span>
      <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[11px]">
        {path}
      </span>
      <button
        type="button"
        onClick={() => onAdd(path)}
        disabled={loading}
        className={cn(
          'border-border bg-background text-foreground hover:bg-muted inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium',
          'disabled:opacity-50'
        )}
      >
        {loading ? (
          <IconLoader2 size={10} stroke={2} className="animate-spin" />
        ) : (
          <IconPlus size={10} stroke={2} />
        )}
        Add
      </button>
    </li>
  )
}

function formatAddedAt(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'Added just now'
  if (mins < 60) return `Added ${mins} min${mins === 1 ? '' : 's'} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Added ${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `Added ${days} day${days === 1 ? '' : 's'} ago`
  return `Added ${new Date(iso).toLocaleDateString()}`
}
