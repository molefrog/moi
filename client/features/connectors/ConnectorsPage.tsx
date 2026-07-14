import { IconPlugConnected } from '@tabler/icons-react'

import { useUserMcp } from './api'
import { McpServerCard, sortMcpServers } from '@/client/features/connectors/McpMenu'
import { SidebarLayout } from '@/client/app/shell/SidebarLayout'
import { Button } from '@/client/components/ui/button'
import { Skeleton } from '@/client/components/ui/skeleton'

const CONNECTOR_SKELETONS = Array.from({ length: 6 }, (_, index) => index)

export function ConnectorsPage() {
  return (
    <SidebarLayout panel="flat">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <UserConnectorsPage />
      </div>
    </SidebarLayout>
  )
}

function UserConnectorsPage() {
  const connectorsQuery = useUserMcp()

  return (
    <div className="mx-auto w-full max-w-3xl px-8 pt-14 pb-16">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-sm font-medium text-foreground">Connectors</h1>
      </div>

      <ConnectorsContent connectorsQuery={connectorsQuery} />
    </div>
  )
}

type ConnectorsContentProps = {
  connectorsQuery: ReturnType<typeof useUserMcp>
}

function ConnectorsContent({ connectorsQuery }: ConnectorsContentProps) {
  if (connectorsQuery.isPending) {
    return (
      <div
        role="status"
        aria-label="Loading connectors"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {CONNECTOR_SKELETONS.map(index => (
          <div
            key={index}
            className="flex min-h-20 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <Skeleton className="size-10 shrink-0 rounded-sm" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (connectorsQuery.isError) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-8 py-12 text-center">
        <p className="text-sm text-muted-foreground">Could not load connectors.</p>
        <Button variant="outline" size="sm" onClick={() => connectorsQuery.refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  const connectors = sortMcpServers(connectorsQuery.data)

  if (connectors.length === 0) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-8 py-12 text-center">
        <IconPlugConnected size={24} stroke={1.5} className="text-muted-foreground" />
        <p className="mx-auto max-w-md text-sm text-foreground">No user connectors configured.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {connectors.map(connector => (
        <McpServerCard key={connector.name} server={connector} />
      ))}
    </div>
  )
}
