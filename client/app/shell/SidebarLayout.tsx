import { type ReactNode } from 'react'

import { IconPlugConnected, IconPlus, IconSmartHome } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'wouter'

import { useReorderWorkspaces, useWorkspaces } from '@/client/features/home/api'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'
import { CreateWorkspaceDialog } from '@/client/features/home/CreateWorkspaceDialog'
import { ReorderableList } from '@/client/components/shared/ReorderableList'
import type { ReorderableRenderState } from '@/client/components/shared/ReorderableList'
import { Button, buttonVariants } from '@/client/components/ui/button'
import {
  workspaceDisplayName,
  workspaceProviderIcon
} from '@/client/features/home/workspace-presentation'
import { cn } from '@/client/lib/cn'
import type { WorkspaceEntry } from '@/lib/types'

function sidebarNavButtonClass(active: boolean): string {
  return cn(
    buttonVariants({ variant: 'ghost', size: 'icon' }),
    active && 'bg-accent text-accent-foreground'
  )
}

type SidebarLayoutProps = {
  // Full panel content — the page supplies its own header (compose it with
  // <PanelHeader>) and body.
  children?: ReactNode
  panel?: 'default' | 'flat'
}

// App shell: a slim icon rail beside the page content. The page owns the panel's
// header and body.
export function SidebarLayout({ children, panel = 'default' }: SidebarLayoutProps) {
  const { data: workspaces } = useWorkspaces()

  // `moi config` / the settings modal broadcast `workspace:updated` (identity
  // changes) and reorder/create broadcast `workspaces-list:updated`; refetch the
  // list so the sidebar reflects it live. Exact: `workspaceKeys.all` is the
  // prefix of every workspace query — a prefix invalidation would refetch
  // transcripts, widgets, and MCP probes in every connected client.
  const qc = useQueryClient()
  useWorkspaceEvent(e => {
    if (e.type === 'workspace:updated' || e.type === 'workspaces-list:updated') {
      qc.invalidateQueries({ queryKey: workspaceKeys.all, exact: true })
    }
  })

  return (
    <div className="flex h-dvh bg-muted">
      <Sidebar workspaces={workspaces ?? []} />
      <main
        className={cn(
          'flex min-w-0 flex-1 flex-col overflow-hidden',
          panel === 'default' &&
            'rounded-l-md border-l border-border bg-background shadow-[1px_0_3px_0_var(--border)]'
        )}
      >
        {children}
      </main>
    </div>
  )
}

type SidebarProps = {
  workspaces: WorkspaceEntry[]
}

function Sidebar({ workspaces }: SidebarProps) {
  const reorder = useReorderWorkspaces()

  return (
    <aside className="flex h-full shrink-0 flex-col items-center gap-4 px-2 py-5">
      <Link href="/" aria-label="Home" title="Home" className={sidebarNavButtonClass}>
        <IconSmartHome stroke={1.5} />
      </Link>

      <nav className="flex max-h-full min-h-0 w-14 flex-1 flex-col items-center justify-center gap-4">
        {workspaces.length > 0 && (
          <>
            <div className="no-scrollbar min-h-0 scroll-fade overflow-y-auto [--scroll-fade-reveal:16px]">
              <ReorderableList
                items={workspaces}
                getId={ws => ws.id}
                className="flex flex-col gap-4"
                onReorder={ids => reorder.mutate(ids)}
                renderPlaceholder={() => (
                  <div className="pointer-events-none absolute top-0 left-1 size-10 rounded-lg bg-accent" />
                )}
                renderOverlay={ws => <WorkspaceButton workspace={ws} dragOverlay />}
                renderItem={(ws, state) => <WorkspaceButton workspace={ws} dragState={state} />}
              />
            </div>
            <div className="shrink-0">
              <CreateWorkspaceDialog
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label="Create new workspace"
                    title="Create new workspace"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <IconPlus data-icon="inline-start" stroke={1.5} />
                  </Button>
                }
              />
            </div>
          </>
        )}
      </nav>

      <ConnectorsNavLink />
    </aside>
  )
}

function ConnectorsNavLink() {
  return (
    <Link
      href="/connectors"
      aria-label="Connectors"
      title="Connectors"
      className={sidebarNavButtonClass}
    >
      <IconPlugConnected stroke={1.5} />
    </Link>
  )
}

type WorkspaceButtonProps = {
  workspace: WorkspaceEntry
  dragOverlay?: boolean
  dragState?: ReorderableRenderState
}

function WorkspaceButton({ workspace, dragOverlay = false, dragState }: WorkspaceButtonProps) {
  const [location] = useLocation()
  const href = `/workspace/${workspace.id}`
  const label = workspaceDisplayName(workspace)
  const active = location === href
  const content = (
    <>
      <div
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon-lg' }),
          'pointer-events-none size-12',
          dragOverlay
            ? 'bg-background shadow-lg'
            : 'group-hover:bg-accent group-hover:text-accent-foreground group-focus-visible:ring-3 group-focus-visible:ring-ring/50',
          active && !dragOverlay && 'bg-accent text-accent-foreground'
        )}
      >
        <img
          src={workspace.icon ?? workspaceProviderIcon[workspace.type ?? 'claude-code']}
          alt=""
          className="size-7 shrink-0 rounded-[4px]"
        />
      </div>
      <span className="mt-0.5 line-clamp-2 w-full text-center text-[11px] leading-snug font-medium text-ellipsis text-foreground">
        {label}
      </span>
    </>
  )

  if (dragOverlay) {
    return <span className="flex w-14 flex-col items-center">{content}</span>
  }

  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      onClick={event => {
        if (dragState?.isDragging) event.preventDefault()
      }}
      className={cn(
        'group flex w-14 flex-col items-center rounded-sm outline-none',
        dragState?.isDragging && 'invisible'
      )}
      {...dragState?.dragHandleProps}
    >
      {content}
    </Link>
  )
}
