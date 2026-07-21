import type { ReactNode } from 'react'

import { IconPlugConnected } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import {
  McpServerCard,
  McpServerCardSkeleton,
  McpServerGrid,
  sortMcpServers
} from '@/client/features/connectors/McpServerCards'
import { useWorkspaceMcp } from '@/client/features/connectors/api'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'

import { SettingsPage } from './SettingsLayout'

const CONNECTOR_SKELETONS = Array.from({ length: 4 }, (_, index) => index)

type ConnectorsContentProps = {
  connectors: ReturnType<typeof useWorkspaceMcp>
}

function ConnectorsContent({ connectors }: ConnectorsContentProps) {
  if (connectors.isPending) {
    return (
      <div role="status" aria-label="Loading connectors">
        <McpServerGrid>
          {CONNECTOR_SKELETONS.map(index => (
            <McpServerCardSkeleton key={index} />
          ))}
        </McpServerGrid>
      </div>
    )
  }

  if (connectors.isError) {
    return (
      <ConnectorsState>
        <p className="text-sm text-muted-foreground">Could not load connectors.</p>
        <Button variant="outline" size="sm" onClick={() => connectors.refetch()}>
          Retry
        </Button>
      </ConnectorsState>
    )
  }

  if (connectors.data.length === 0) {
    return (
      <ConnectorsState>
        <IconPlugConnected size={24} stroke={1.5} className="text-muted-foreground" />
        <p className="text-sm text-foreground">No connectors configured.</p>
      </ConnectorsState>
    )
  }

  return (
    <McpServerGrid>
      {sortMcpServers(connectors.data).map(connector => (
        <McpServerCard key={connector.name} server={connector} />
      ))}
    </McpServerGrid>
  )
}

type ConnectorsStateProps = {
  children: ReactNode
}

function ConnectorsState({ children }: ConnectorsStateProps) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-8 py-12 text-center">
      {children}
    </div>
  )
}

export function ConnectorsSettings() {
  const { workspaceId } = useWorkspaceLayoutCtx()
  const connectors = useWorkspaceMcp(workspaceId, true)

  return (
    <SettingsPage
      title="Connectors"
      description="Connectors available to the agent in this workspace."
    >
      <ConnectorsContent connectors={connectors} />
    </SettingsPage>
  )
}
