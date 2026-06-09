import { useWorkspaceLayout, useWorkspaceMcp } from '@/client/api/workspaces'
import { Button } from '@/client/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/client/components/ui/hover-card'
import { useScrollFade } from '@/client/hooks/useScrollFade'
import { formatMcpServerName, getMcpIcon } from '@/client/lib/mcp-icons'
import { useWorkspaceId } from '@/client/lib/WorkspaceContext'
import { cn } from '@/client/lib/cn'
import type { McpServer } from '@/lib/types'

// MCP icon — supplied by design (not a Tabler glyph). Stroke inherits the
// current text color; the parent button sizes it via `[&_svg]:size-*`.
function IconMcp({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3.49994 11.7501L11.6717 3.57855C12.7762 2.47398 14.5672 2.47398 15.6717 3.57855C16.7762 4.68312 16.7762 6.47398 15.6717 7.57855M15.6717 7.57855L9.49994 13.7501M15.6717 7.57855C16.7762 6.47398 18.5672 6.47398 19.6717 7.57855C20.7762 8.68312 20.7762 10.474 19.6717 11.5785L12.7072 18.543C12.3167 18.9335 12.3167 19.5667 12.7072 19.9572L13.9999 21.2499" />
      <path d="M17.4999 9.74921L11.3282 15.921C10.2238 17.0255 8.43275 17.0255 7.32825 15.921C6.22376 14.8164 6.22376 13.0255 7.32825 11.921L13.4999 5.74939" />
    </svg>
  )
}

function McpServerRow({ server }: { server: McpServer }) {
  const icon = getMcpIcon(server.name)
  const connected = server.status === 'connected'
  return (
    <div className="flex items-center gap-2.5 rounded-xs px-2 py-1 hover:bg-muted">
      {icon ? (
        <img src={icon} alt="" className="size-5 shrink-0 rounded ring-2 ring-background" />
      ) : (
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground ring-2 ring-background">
          <IconMcp className="size-4" />
        </span>
      )}
      <span className="flex-1 truncate text-sm text-foreground">
        {formatMcpServerName(server.name)}
      </span>
      <span
        className={cn(
          'size-[5px] shrink-0 rounded-full',
          connected ? 'bg-emerald-500' : 'bg-yellow-500/75'
        )}
      />
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

// MCP status hover card — Claude workspaces only (OpenClaw/Hermes use other
// backends). Lists each MCP server with a green/red dot. The (expensive, cached)
// status query: while it hasn't resolved the trigger is just a gray icon with no
// dot and no hover card; once loaded the card opens on hover and the icon goes
// dark + shows a dot badge when any server is connected.
export function McpMenu() {
  const workspaceId = useWorkspaceId()
  const { data: layout } = useWorkspaceLayout(workspaceId)
  const isClaude = !!layout && layout.provider !== 'openclaw' && layout.provider !== 'hermes'
  const { data: servers } = useWorkspaceMcp(workspaceId, isClaude)

  if (!isClaude) return null

  const anyConnected = servers?.some(s => s.status === 'connected') ?? false

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      aria-label="MCP"
      className={cn(
        'relative size-7 [&_svg]:size-[20px]',
        anyConnected ? 'text-foreground' : 'text-muted-foreground'
      )}
    >
      <IconMcp />
      {anyConnected && (
        <span className="absolute right-[5px] bottom-1.5 size-[5px] rounded-full bg-foreground ring-1 ring-background" />
      )}
    </Button>
  )

  // Not loaded yet → plain gray icon, no hover card.
  if (!servers) return trigger

  // Active (connected) servers first, then disabled/errored/auth-pending. The
  // sort is stable, so each group keeps the server list's original order.
  const sorted = [...servers].sort(
    (a, b) => Number(b.status === 'connected') - Number(a.status === 'connected')
  )

  return (
    <HoverCard delay={0} closeDelay={100}>
      <HoverCardTrigger render={trigger} />
      <HoverCardContent align="end" sideOffset={6} className="w-56 p-1">
        <div className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">
          Connected MCPs
        </div>
        {servers.length === 0 ? (
          <div className="px-2 py-1 text-sm text-muted-foreground">No MCP servers</div>
        ) : (
          <McpList servers={sorted} />
        )}
      </HoverCardContent>
    </HoverCard>
  )
}
