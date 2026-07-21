import type { ReactNode } from 'react'

import { IconAlertCircleFilled } from '@tabler/icons-react'

import { Skeleton } from '@/client/components/ui/skeleton'
import { IconMcp } from '@/client/features/connectors/IconMcp'
import { formatMcpServerName, getMcpIcon } from '@/client/features/connectors/mcp-icons'
import type { McpServer } from '@/lib/types'

function statusLabel(status: McpServer['status']): string {
  if (status === 'needs-auth') return 'Needs auth'
  return status[0].toUpperCase() + status.slice(1)
}

type McpServerIconProps = {
  name: string
  status: McpServer['status']
}

function McpServerIcon({ name, status }: McpServerIconProps) {
  const icon = getMcpIcon(name)
  const className = 'size-full rounded-sm ring-2 ring-background'

  return (
    <span className="relative size-10 shrink-0">
      {icon ? (
        <img src={icon} alt="" className={className} />
      ) : (
        <span className="flex size-full items-center justify-center rounded-sm bg-muted text-muted-foreground ring-2 ring-background">
          <IconMcp className="size-5" />
        </span>
      )}
      {status !== 'connected' && (
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
  return [...servers].sort(
    (a, b) => Number(b.status === 'connected') - Number(a.status === 'connected')
  )
}

type McpServerCardProps = {
  server: McpServer
}

type McpServerCardLayoutProps = {
  icon: ReactNode
  children: ReactNode
}

function McpServerCardLayout({ icon, children }: McpServerCardLayoutProps) {
  return (
    <div className="flex items-center gap-3 text-card-foreground">
      {icon}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">{children}</div>
    </div>
  )
}

export function McpServerCard({ server }: McpServerCardProps) {
  return (
    <McpServerCardLayout icon={<McpServerIcon name={server.name} status={server.status} />}>
      <div className="truncate text-sm font-medium text-foreground">
        {formatMcpServerName(server.name)}
      </div>
      <span className="text-sm text-muted-foreground">{statusLabel(server.status)}</span>
    </McpServerCardLayout>
  )
}

export function McpServerCardSkeleton() {
  return (
    <McpServerCardLayout icon={<Skeleton className="size-10 shrink-0 rounded-sm" />}>
      <Skeleton className="h-4 w-36 max-w-full" />
      <Skeleton className="h-4 w-20" />
    </McpServerCardLayout>
  )
}

type McpServerGridProps = {
  children: ReactNode
}

export function McpServerGrid({ children }: McpServerGridProps) {
  return <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">{children}</div>
}
