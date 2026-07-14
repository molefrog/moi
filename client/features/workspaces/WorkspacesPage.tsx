import { IconChevronRight, IconFolders, IconLoader2, IconPlus } from '@tabler/icons-react'

import { useAddWorkspace, useDiscoveredWorkspaces, useWorkspaces } from './api'
import { Button } from '@/client/components/ui/button'
import { LedLogo } from '@/client/components/shared/LedLogo'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/client/components/ui/collapsible'
import { cn } from '@/client/lib/cn'
import { useUiStore } from '@/client/store/ui'
import {
  WorkspaceTypeIcon,
  workspaceDisplayName,
  workspaceProviderIcon
} from '@/client/features/workspaces/workspace-presentation'
import type { DiscoveredWorkspace, WorkspaceEntry } from '@/lib/types'

import { CreateWorkspaceDialog } from './CreateWorkspaceDialog'
import { WorkspacePreview } from './WorkspacePreview'

export function WorkspacesPage() {
  const workspacesQuery = useWorkspaces()
  const discoveredQuery = useDiscoveredWorkspaces()
  const importMutation = useAddWorkspace()
  const discoveredWorkspacesOpen = useUiStore(state => state.discoveredWorkspacesOpen)
  const setDiscoveredWorkspacesOpen = useUiStore(state => state.setDiscoveredWorkspacesOpen)

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
        <p className="text-sm text-muted-foreground">Could not load spaces.</p>
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
      <div className="mb-8 flex items-center">
        <LedLogo sprite="moi-full" pixelSize={4} gap={1} />
      </div>

      {count > 0 ? (
        <section className="mb-10">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h1 className="text-sm font-medium text-foreground">My spaces</h1>
            <CreateWorkspaceDialog
              trigger={
                <Button variant="outline" size="sm">
                  <IconPlus data-icon="inline-start" stroke={1.75} />
                  New
                </Button>
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {workspaces.map(ws => (
              <WorkspaceCard key={ws.id} workspace={ws} />
            ))}
          </div>
        </section>
      ) : (
        <div className="mb-10 flex flex-col items-center gap-4 px-8 py-16 text-center">
          <IconFolders size={24} stroke={1.5} className="text-muted-foreground/70" />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-medium">Create your first space</h1>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Initialize moi in any folder on your computer with{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">moi init</code>, or
              add an existing folder where you&rsquo;ve worked with other agents.
            </p>
          </div>
          <CreateWorkspaceDialog trigger={<Button size="sm">Create a space</Button>} />
        </div>
      )}

      {discovered.length > 0 && (
        <section>
          <Collapsible
            open={discoveredWorkspacesOpen}
            onOpenChange={setDiscoveredWorkspacesOpen}
            className="group"
          >
            <CollapsibleTrigger
              className={cn(
                'group/trigger',
                'flex w-full items-center gap-1 pb-4 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                'text-muted-foreground group-data-open:text-foreground hover:text-foreground'
              )}
            >
              <span className="text-sm font-medium">Import from this computer</span>
              <IconChevronRight
                size={16}
                stroke={2}
                className={cn(
                  'opacity-0 transition-[opacity,transform]',
                  'group-hover/trigger:opacity-100 group-focus-visible/trigger:opacity-100 group-data-open:rotate-90'
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
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
              {importMutation.isError && (
                <p className="mt-3 text-xs text-destructive">{importMutation.error.message}</p>
              )}
            </CollapsibleContent>
          </Collapsible>
        </section>
      )}
    </div>
  )
}

type WorkspaceCardProps = {
  workspace: WorkspaceEntry
}

function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const name = workspaceDisplayName(workspace)
  const meta = formatAddedAt(workspace.addedAt)

  return (
    <a
      href={`/workspace/${workspace.id}`}
      className={cn(
        'group flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-2 hover:shadow-sm',
        'transition-colors'
      )}
    >
      <WorkspacePreview workspaceId={workspace.id} />
      <div className="flex min-w-0 flex-col px-2 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <img
            src={workspace.icon ?? workspaceProviderIcon[workspace.type ?? 'claude-code']}
            alt=""
            className="size-4 shrink-0 rounded-[4px]"
          />
          <span className="truncate text-sm font-medium text-foreground">{name}</span>
        </div>
        <div title={workspace.path} className="mt-2 truncate text-xs text-muted-foreground">
          {workspace.displayPath ?? workspace.path}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">{meta}</div>
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
  const name = workspaceDisplayName(suggestion)
  return (
    <li className="flex items-center gap-2 border-b border-border px-1 py-3">
      <WorkspaceTypeIcon type={type} />
      <span className="shrink-0 text-sm font-medium text-foreground">{name}</span>
      <span title={path} className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {suggestion.displayPath ?? path}
      </span>
      <Button variant="outline" size="sm" onClick={() => onAdd(suggestion)} disabled={loading}>
        {loading ? (
          <IconLoader2 stroke={1.75} className="animate-spin" />
        ) : (
          <IconPlus stroke={1.75} />
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
