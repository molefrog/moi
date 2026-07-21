import { IconChevronRight, IconEggCracked, IconLoader2, IconPlus } from '@tabler/icons-react'
import { Link, useLocation } from 'wouter'

import {
  useDiscoveredWorkspaces,
  useWorkspacePreview,
  useWorkspaces,
  useWorkspaceSetupInfo
} from './api'
import { CreateWorkspaceDialog } from './workspace-setup/CreateWorkspaceDialog'
import { ImportWorkspaceDialog } from './workspace-setup/ImportWorkspaceDialog'
import { useWorkspaceImport } from './workspace-setup/useWorkspaceImport'
import { HomeLogo } from './HomeLogo'
import { Button } from '@/client/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/client/components/ui/collapsible'
import { cn } from '@/client/lib/cn'
import { useUiStore } from '@/client/store/ui'
import {
  WorkspaceAgentIcons,
  workspaceDisplayName,
  workspaceProviderIcon
} from '@/client/features/home/workspace-presentation'
import type { DiscoveredWorkspace, WorkspaceEntry } from '@/lib/types'

import { WorkspacePreview } from './WorkspacePreview'

export function HomePage() {
  const [, navigate] = useLocation()
  const workspacesQuery = useWorkspaces()
  const discoveredQuery = useDiscoveredWorkspaces()
  const setupInfo = useWorkspaceSetupInfo()
  const importFlow = useWorkspaceImport({
    onSuccess: entry => navigate(`/workspace/${entry.id}`)
  })
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

  function handleAdd(suggestion: DiscoveredWorkspace) {
    importFlow.startImport(suggestion)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-8 pt-14 pb-16">
      <HomeLogo className="mb-8" />

      {count > 0 ? (
        <section className="mb-10">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h1 className="text-sm font-medium text-foreground">My workspaces</h1>
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
        <div className="mb-10 flex flex-col items-center gap-4 px-8 pt-6 pb-12 text-center">
          <IconEggCracked size={32} stroke={1.5} className="text-muted-foreground" />
          <div className="flex flex-col gap-1.5">
            <h2 className="font-medium">Let’s start with creating your first workspace</h2>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              Workspace is a place for all the chats, widgets, and views that share the same
              context. Create a new one or import an existing folder you&rsquo;ve worked in before.
            </p>
          </div>
          <CreateWorkspaceDialog trigger={<Button>Create workspace</Button>} />
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
                  <SuggestedRow key={item.path} suggestion={item} onAdd={handleAdd} />
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </section>
      )}

      {importFlow.choice && (
        <ImportWorkspaceDialog
          choice={importFlow.choice}
          availability={setupInfo.data?.availability}
          isPending={importFlow.isPending}
          errorMessage={importFlow.error?.message}
          onTypeChange={importFlow.selectType}
          onSubmit={importFlow.submit}
          onReset={importFlow.reset}
        />
      )}
    </div>
  )
}

type WorkspaceCardProps = {
  workspace: WorkspaceEntry
}

function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const name = workspaceDisplayName(workspace)
  const previewQuery = useWorkspacePreview(workspace.id)
  const updatedAt = previewQuery.data?.updatedAt ?? new Date(workspace.addedAt).getTime()

  return (
    <Link
      href={`/workspace/${workspace.id}`}
      className="group flex min-w-0 flex-col gap-4 rounded-xl bg-card p-2 shadow-xs transition-shadow hover:shadow-sm"
    >
      <WorkspacePreview workspaceId={workspace.id} />
      <div className="flex min-w-0 flex-col gap-2 px-2 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <img
            src={workspace.icon ?? workspaceProviderIcon[workspace.type ?? 'claude-code']}
            alt=""
            className="size-4 shrink-0 rounded-[4px]"
          />
          <span className="truncate text-sm font-medium text-foreground">{name}</span>
        </div>
        <span className="text-xs text-muted-foreground">{formatUpdatedAt(updatedAt)}</span>
      </div>
    </Link>
  )
}

type SuggestedRowProps = {
  suggestion: DiscoveredWorkspace
  onAdd: (suggestion: DiscoveredWorkspace) => void
}

function SuggestedRow({ suggestion, onAdd }: SuggestedRowProps) {
  const { path, types } = suggestion
  const name = workspaceDisplayName(suggestion)
  return (
    <li className="flex items-center gap-2 border-b border-border px-1 py-3">
      <WorkspaceAgentIcons types={types} />
      <span className="shrink-0 text-sm font-medium text-foreground">{name}</span>
      <span title={path} className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {suggestion.displayPath ?? path}
      </span>
      <Button variant="outline" size="sm" onClick={() => onAdd(suggestion)}>
        <IconPlus stroke={1.75} />
        Add
      </Button>
    </li>
  )
}

function formatUpdatedAt(timestamp: number): string {
  const ms = Date.now() - timestamp
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'Updated just now'
  if (mins < 60) return `Updated ${mins} min${mins === 1 ? '' : 's'} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `Updated ${days} day${days === 1 ? '' : 's'} ago`
  return `Updated ${new Date(timestamp).toLocaleDateString()}`
}
