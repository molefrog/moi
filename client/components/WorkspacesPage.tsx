import { IconDots, IconLoader2, IconPlus, IconTrash } from '@tabler/icons-react'

import {
  useAddWorkspace,
  useDiscoveredWorkspaces,
  useRemoveWorkspace,
  useWorkspaces
} from '@/client/api/workspaces'
import claudeIcon from '@/client/assets/claude.svg'
import hermesIcon from '@/client/assets/hermes-nous.png'
import openclawIcon from '@/client/assets/openclaw.svg'
import { Button } from '@/client/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/client/components/ui/dropdown-menu'
import { cn } from '@/client/lib/cn'
import type { DiscoveredWorkspace, WorkspaceEntry, WorkspaceType } from '@/lib/types'

import { WorkspacePreview } from './WorkspacePreview'

const typeIconSrc: Record<WorkspaceType, string> = {
  'claude-code': claudeIcon,
  openclaw: openclawIcon,
  hermes: hermesIcon
}

const typeLabel: Record<WorkspaceType, string> = {
  'claude-code': 'Claude Code',
  openclaw: 'OpenClaw',
  hermes: 'Hermes'
}

function TypeIcon({ type, className }: { type: WorkspaceType; className?: string }) {
  return (
    <img
      src={typeIconSrc[type]}
      alt=""
      aria-label={typeLabel[type]}
      className={cn('size-4 shrink-0', className)}
    />
  )
}

export function WorkspacesPage() {
  const workspacesQuery = useWorkspaces()
  const discoveredQuery = useDiscoveredWorkspaces()
  const importMutation = useAddWorkspace()
  const removeMutation = useRemoveWorkspace()

  if (workspacesQuery.isPending || discoveredQuery.isPending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <IconLoader2 size={20} stroke={1.5} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (workspacesQuery.isError || discoveredQuery.isError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Could not load workspaces.</p>
      </div>
    )
  }

  const workspaces = workspacesQuery.data
  const discovered = discoveredQuery.data
  const count = workspaces.length
  const importingPath =
    importMutation.isPending && importMutation.variables ? importMutation.variables.path : null

  return (
    <div className="mx-auto w-full max-w-3xl px-8 pt-14 pb-16">
      {count > 0 && (
        <div className="mb-10 grid grid-cols-2 gap-3">
          {workspaces.map(ws => (
            <WorkspaceCard
              key={ws.id}
              workspace={ws}
              onRemove={entry => removeMutation.mutate(entry)}
            />
          ))}
        </div>
      )}

      {count === 0 && discovered.length === 0 && (
        <p className="mb-10 text-sm text-muted-foreground">
          No workspaces yet. Run{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">moi start</code> in a
          project directory.
        </p>
      )}

      {discovered.length > 0 && (
        <section>
          <div className="mb-4">
            <h2 className="mb-1.5 text-sm font-semibold text-foreground">Found on your machine</h2>
            <p className="text-xs text-muted-foreground">Discovered via Claude Code and OpenClaw</p>
          </div>
          <ul className="border-t border-border">
            {discovered.map(item => (
              <SuggestedRow
                key={item.path}
                suggestion={item}
                onAdd={s => importMutation.mutate(s)}
                loading={importingPath === item.path}
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
  onRemove: (workspace: WorkspaceEntry) => void
}

function WorkspaceCard({ workspace, onRemove }: WorkspaceCardProps) {
  const name = displayName(workspace)
  const meta = formatAddedAt(workspace.addedAt)

  function handleRemove() {
    const message = `Remove "${name}" from your workspaces?\n\nThis only removes it from your list. The folder and its sessions stay on disk — you can add it back any time.`
    if (window.confirm(message)) onRemove(workspace)
  }

  return (
    <a
      href={`/workspace/${workspace.id}`}
      className={cn(
        'group flex gap-3.5 rounded-xl border border-border bg-card p-2 hover:bg-muted/40',
        'transition-colors'
      )}
    >
      <WorkspacePreview workspaceId={workspace.id} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-1 pr-2 pl-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <TypeIcon type={workspace.type ?? 'claude-code'} />
            <span className="truncate text-sm font-semibold text-foreground">{name}</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  className="-mt-0.5 -mr-1 text-muted-foreground"
                  aria-label="More actions"
                >
                  <IconDots stroke={1.5} />
                </Button>
              }
            />
            <DropdownMenuContent align="end" sideOffset={4} className="min-w-40">
              <DropdownMenuItem
                variant="destructive"
                onClick={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleRemove()
                }}
              >
                <IconTrash stroke={1.5} />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div title={workspace.path} className="truncate font-mono text-xs text-muted-foreground">
          {workspace.displayPath ?? workspace.path}
        </div>
        <div className="flex-1" />
        <div className="text-xs text-muted-foreground">{meta}</div>
      </div>
    </a>
  )
}

type SuggestedRowProps = {
  suggestion: DiscoveredWorkspace
  onAdd: (suggestion: DiscoveredWorkspace) => void
  loading: boolean
}

function SuggestedRow({ suggestion, onAdd, loading }: SuggestedRowProps) {
  const { path, type } = suggestion
  const name = displayName(suggestion)
  return (
    <li className="flex items-center gap-3 border-b border-border px-1 py-2.5">
      <TypeIcon type={type} className="opacity-70" />
      <span className="shrink-0 text-sm font-medium text-foreground/80">{name}</span>
      <span
        title={path}
        className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
      >
        {suggestion.displayPath ?? path}
      </span>
      <Button variant="outline" size="sm" onClick={() => onAdd(suggestion)} disabled={loading}>
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

function displayName(ws: Pick<WorkspaceEntry, 'name' | 'path' | 'type' | 'agentId'>): string {
  if (ws.name) return ws.name
  if (ws.type === 'openclaw') return ws.agentId ?? 'OpenClaw agent'
  return ws.path.split('/').pop() || ws.path
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
