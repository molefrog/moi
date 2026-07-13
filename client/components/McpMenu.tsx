import { useWorkspaceMcp } from '@/client/api/workspaces'
import { IconAlertCircleFilled, IconPlugConnected } from '@tabler/icons-react'
import { IconMcp } from '@/client/components/IconMcp'
import { Button } from '@/client/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/client/components/ui/hover-card'
import { useScrollFade } from '@/client/hooks/useScrollFade'
import { formatMcpServerName, getMcpIcon } from '@/client/lib/mcp-icons'
import { useWorkspaceId } from '@/client/lib/WorkspaceContext'
import { useWorkspaceLayoutCtx } from '@/client/lib/WorkspaceLayoutContext'
import { cn } from '@/client/lib/cn'
import type { McpServer } from '@/lib/types'

function statusLabel(status: McpServer['status']): string {
  if (status === 'needs-auth') return 'Needs auth'
  return status[0].toUpperCase() + status.slice(1)
}

function McpStatusDot({ status }: { status: McpServer['status'] }) {
  const connected = status === 'connected'
  return (
    <span
      className={cn(
        'size-[5px] shrink-0 rounded-full',
        connected ? 'bg-emerald-500' : 'bg-yellow-500'
      )}
    />
  )
}

type McpServerIconProps = {
  name: string
  status: McpServer['status']
  size?: 'sm' | 'lg'
}

function McpServerIcon({ name, status, size = 'sm' }: McpServerIconProps) {
  const icon = getMcpIcon(name)
  const large = size === 'lg'
  const className = 'size-full rounded-sm ring-2 ring-background'

  return (
    <span className={cn('relative shrink-0', large ? 'size-10' : 'size-5')}>
      {icon ? (
        <img src={icon} alt="" className={className} />
      ) : (
        <span
          className={cn(
            'flex size-full items-center justify-center bg-muted text-muted-foreground ring-2 ring-background',
            large ? 'rounded-sm' : 'rounded'
          )}
        >
          <IconMcp className={large ? 'size-5' : 'size-4'} />
        </span>
      )}
      {large && status !== 'connected' && (
        <IconAlertCircleFilled
          aria-hidden="true"
          size={16}
          stroke={1.75}
          className="absolute -top-1 -right-1 rounded-full bg-card text-amber-400"
        />
      )}
    </span>
  )
}

export function sortMcpServers(servers: McpServer[]): McpServer[] {
  // Active (connected) servers first, then disabled/errored/auth-pending. The
  // sort is stable, so each group keeps the server list's original order.
  return [...servers].sort(
    (a, b) => Number(b.status === 'connected') - Number(a.status === 'connected')
  )
}

export function McpServerRow({ server }: { server: McpServer }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xs px-2 py-1 text-foreground hover:bg-accent hover:text-accent-foreground">
      <McpServerIcon name={server.name} status={server.status} />
      <span className="flex-1 truncate text-sm">{formatMcpServerName(server.name)}</span>
      <McpStatusDot status={server.status} />
    </div>
  )
}

export function McpServerCard({ server }: { server: McpServer }) {
  return (
    <div className="flex min-h-20 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-card-foreground">
      <McpServerIcon name={server.name} status={server.status} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <div className="truncate text-sm font-medium text-foreground">
          {formatMcpServerName(server.name)}
        </div>
        <span className="text-sm text-muted-foreground">{statusLabel(server.status)}</span>
      </div>
    </div>
  )
}

// The scrollable server list. Its own component so `useScrollFade`'s effect runs
// when the (portaled, mount-on-open) hover card opens — attaching the scroll ref.
// Overflow is signalled with top/bottom mask fades; the scrollbar is hidden.
function McpList({ servers }: { servers: McpServer[] }) {
  const { ref, showTopFade, showBottomFade } = useScrollFade()
  const fade =
    showTopFade && showBottomFade
      ? 'mask-fade-y'
      : showTopFade
        ? 'mask-fade-top'
        : showBottomFade
          ? 'mask-fade-bottom'
          : undefined
  return (
    <div
      ref={ref}
      className={cn(
        'scrollbar-none flex max-h-72 flex-col overflow-y-auto overscroll-contain',
        fade
      )}
    >
      {servers.map(server => (
        <McpServerRow key={server.name} server={server} />
      ))}
    </div>
  )
}

// Project-scoped connector status hover card — Claude workspaces only
// (OpenClaw/Hermes use other backends). User-scoped connectors live on the
// standalone Connectors page.
export function McpMenu() {
  const workspaceId = useWorkspaceId()
  // Read provider from the shared layout context, not a second `useWorkspaceLayout`
  // observer — a duplicate observer that remounts (e.g. when this menu moves
  // between the fullscreen and two-pane headers) fires `refetchOnMount`, which
  // overwrites an in-flight optimistic chat-mode change before it's persisted.
  const { provider, isLoading } = useWorkspaceLayoutCtx()
  const isClaude = !isLoading && provider !== 'openclaw' && provider !== 'hermes'
  const { data: servers } = useWorkspaceMcp(workspaceId, isClaude)

  if (!isClaude) return null
  if (!servers || servers.length === 0) return null

  const trigger = (
    <Button variant="ghost" size="icon-sm" aria-label="Connectors" title="Connectors">
      <IconPlugConnected stroke={1.75} />
    </Button>
  )

  const sorted = sortMcpServers(servers)

  return (
    <HoverCard delay={0} closeDelay={100}>
      <HoverCardTrigger render={trigger} />
      <HoverCardContent align="end" sideOffset={6} className="w-56 p-1">
        <div className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">
          Project connectors
        </div>
        <McpList servers={sorted} />
      </HoverCardContent>
    </HoverCard>
  )
}
