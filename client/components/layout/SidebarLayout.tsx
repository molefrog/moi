import { type ReactNode } from 'react'

import { IconPlugConnected, IconPlus, IconSmartHome } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'wouter'

import { useReorderWorkspaces, useWorkspaces, workspaceKeys } from '@/client/api/workspaces'
import { useMeiEvent } from '@/client/hooks/useMeiEvents'
import claudeIcon from '@/client/assets/claude.svg'
import hermesIcon from '@/client/assets/hermes-nous.png'
import openclawIcon from '@/client/assets/openclaw.svg'
import { CreateWorkspaceDialog } from '@/client/components/CreateWorkspaceDialog'
import { ReorderableList } from '@/client/components/ReorderableList'
import type { ReorderableRenderState } from '@/client/components/ReorderableList'
import { Button, buttonVariants } from '@/client/components/ui/button'
import { cn } from '@/client/lib/cn'
import type { WorkspaceEntry, WorkspaceType } from '@/lib/types'

export const PROVIDER_ICON: Record<WorkspaceType, string> = {
  'claude-code': claudeIcon,
  openclaw: openclawIcon,
  hermes: hermesIcon
}

// Display name: explicit name → OpenClaw agentId → path basename.
function workspaceLabel(ws: WorkspaceEntry): string {
  if (ws.name) return ws.name
  if (ws.type === 'openclaw') return ws.agentId ?? 'OpenClaw agent'
  return ws.path.split('/').pop() || ws.path
}

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

  // `moi config` / the settings modal broadcast `workspace:updated`; refetch the
  // list so the sidebar reflects new names/icons live.
  const qc = useQueryClient()
  useMeiEvent(e => {
    if (e.type === 'workspace:updated') qc.invalidateQueries({ queryKey: workspaceKeys.all })
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

// Styling-only header bar. Pages compose their header inside it.
type PanelHeaderProps = {
  children?: ReactNode
}

export function PanelHeader({ children }: PanelHeaderProps) {
  return (
    <header className="@container flex h-11 shrink-0 items-center gap-2.5 border-b border-border/75 px-3">
      {children}
    </header>
  )
}

type SidebarProps = {
  workspaces: WorkspaceEntry[]
}

function Sidebar({ workspaces }: SidebarProps) {
  const reorder = useReorderWorkspaces()

  return (
    <aside className="flex h-full shrink-0 flex-col px-2 py-5">
      <div className="flex items-center justify-center">
        <Link href="/" aria-label="Home" title="Home" className={sidebarNavButtonClass}>
          <IconSmartHome stroke={1.5} />
        </Link>
      </div>

      <nav className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4">
        {workspaces.length > 0 && (
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
        )}
        {workspaces.length > 0 && (
          <CreateWorkspaceDialog
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label="Create new space"
                title="Create new space"
                className="text-muted-foreground hover:text-foreground"
              >
                <IconPlus data-icon="inline-start" stroke={1.5} />
              </Button>
            }
          />
        )}
      </nav>

      <div className="flex shrink-0 items-center justify-center">
        <ConnectorsNavLink />
      </div>
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
  const label = workspaceLabel(workspace)
  const active = location === href
  const content = (
    <>
      <span
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
          src={workspace.icon ?? PROVIDER_ICON[workspace.type ?? 'claude-code']}
          alt=""
          className="size-7 shrink-0 rounded-[4px]"
        />
      </span>
      <span className="w-full truncate text-center text-xs font-medium text-foreground">
        {label}
      </span>
    </>
  )

  if (dragOverlay) {
    return <span className="flex w-14 flex-col items-center gap-0.5">{content}</span>
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
        'group flex w-14 flex-col items-center gap-0.5 rounded-sm outline-none',
        dragState?.isDragging && 'invisible'
      )}
      {...dragState?.dragHandleProps}
    >
      {content}
    </Link>
  )
}
