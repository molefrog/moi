import { IconDots, IconLoader2, IconPlus } from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'wouter'

import claudeIcon from '@/client/assets/claude.svg'
import { Button } from '@/client/components/ui/button'
import { cn } from '@/client/lib/cn'
import type { WorkspaceEntry } from '@/lib/types'

const workspacesKey = ['workspaces'] as const
const discoverKey = ['workspaces', 'discover'] as const

export function WorkspacesPage() {
  const workspacesQuery = useQuery<WorkspaceEntry[]>({
    queryKey: workspacesKey,
    queryFn: () => fetch('/api/workspaces').then(r => r.json())
  })

  const discoveredQuery = useQuery<string[]>({
    queryKey: discoverKey,
    queryFn: () => fetch('/api/workspaces/discover').then(r => r.json())
  })

  const qc = useQueryClient()
  const importMutation = useMutation<WorkspaceEntry, Error, string>({
    mutationFn: async path => {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      })
      return res.json()
    },
    onSuccess: (entry, path) => {
      qc.setQueryData<WorkspaceEntry[]>(workspacesKey, prev => [...(prev ?? []), entry])
      qc.setQueryData<string[]>(discoverKey, prev => (prev ?? []).filter(p => p !== path))
    }
  })

  if (workspacesQuery.isPending || discoveredQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <IconLoader2 size={20} stroke={1.5} className="text-muted-foreground animate-spin" />
      </div>
    )
  }

  if (workspacesQuery.isError || discoveredQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Could not load workspaces.</p>
      </div>
    )
  }

  const workspaces = workspacesQuery.data
  const discovered = discoveredQuery.data
  const count = workspaces.length
  const importingPath = importMutation.isPending ? importMutation.variables : null

  return (
    <div className="mx-auto w-full max-w-3xl px-8 pb-16 pt-14">
      <header className="mb-10 flex flex-col gap-1.5">
        <h1 className="text-foreground text-xl font-semibold tracking-tight">Workspaces</h1>
        <p className="text-muted-foreground text-sm">
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
            <h2 className="text-foreground mb-1.5 text-sm font-semibold">Found on your machine</h2>
            <p className="text-muted-foreground text-xs">
              Discovered via{' '}
              <span className="text-foreground/70 font-mono">~/.claude/projects</span>
            </p>
          </div>
          <ul className="border-border border-t">
            {discovered.map(path => (
              <SuggestedRow
                key={path}
                path={path}
                onAdd={p => importMutation.mutate(p)}
                loading={importingPath === path}
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
            <img src={claudeIcon} alt="" aria-hidden className="size-4 shrink-0" />
            <span className="text-foreground truncate text-sm font-semibold">{name}</span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
            }}
            className="text-muted-foreground -mr-1 -mt-0.5"
            aria-label="More actions"
          >
            <IconDots stroke={1.5} />
          </Button>
        </div>
        <div className="text-muted-foreground truncate font-mono text-xs">{workspace.path}</div>
        <div className="flex-1" />
        <div className="text-muted-foreground text-xs">{meta}</div>
      </div>
    </Link>
  )
}

function PreviewSkeleton() {
  return (
    <div className="bg-muted flex size-24 shrink-0 flex-col gap-1 rounded-lg p-2">
      <div className="flex h-2 items-center gap-1">
        <div className="bg-muted-foreground/25 size-2 rounded-full" />
        <div className="bg-muted-foreground/25 h-1 flex-1 rounded-[2px]" />
      </div>
      <div className="flex flex-1 gap-1">
        <div className="flex w-4 flex-col gap-0.5">
          <div className="bg-muted-foreground/25 h-1 w-full rounded-[2px]" />
          <div className="bg-muted-foreground/25 h-1 w-full rounded-[2px]" />
          <div className="bg-muted-foreground/15 h-1 w-full rounded-[2px]" />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex gap-1">
            <div className="bg-muted-foreground/25 h-3.5 flex-[2] rounded-[3px]" />
            <div className="bg-muted-foreground/15 h-3.5 flex-1 rounded-[3px]" />
          </div>
          <div className="bg-muted-foreground/15 h-4 rounded-[3px]" />
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
      <img src={claudeIcon} alt="" aria-hidden className="size-4 shrink-0 opacity-70" />
      <span className="text-foreground/80 shrink-0 text-sm font-medium">{name}</span>
      <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs">
        {path}
      </span>
      <Button variant="outline" size="sm" onClick={() => onAdd(path)} disabled={loading}>
        {loading ? (
          <IconLoader2 stroke={1.5} className="animate-spin" />
        ) : (
          <IconPlus stroke={1.5} />
        )}
        Add
      </Button>
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
