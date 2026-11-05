import type { ReactNode } from 'react'

import { IconPlugConnected } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import {
  McpServerCard,
  McpServerCardSkeleton,
  McpServerGrid,
  sortMcpServers
} from '@/client/features/connectors/mcp-server-cards'
import { useWorkspaceMcp } from '@/client/features/connectors/api'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/workspace-layout-context'

import { SettingsPage } from './settings-layout'

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

  if (connectors.isError && !connectors.data?.length) {
    return (
      <ConnectorsState>
        <p className="text-sm text-muted-foreground">Could not load connectors</p>
        <Button variant="outline" size="sm" onClick={() => connectors.refetch()}>
          Retry
        </Button>
      </ConnectorsState>
    )
  }

  if (connectors.data.length === 0 && !connectors.isFetching) {
    return (
      <ConnectorsState>
        <IconPlugConnected size={24} stroke={1.5} className="text-muted-foreground" />
        <p className="text-sm text-foreground">No connectors configured</p>
      </ConnectorsState>
    )
  }

  return (
    <>
      <McpServerGrid>
        {sortMcpServers(connectors.data).map(connector => (
          <McpServerCard key={connector.name} server={connector} />
        ))}
      </McpServerGrid>
      {connectors.isFetching && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading connectors…
        </p>
      )}
      {connectors.isError && (
        <ConnectorsState>
          <p className="text-sm text-muted-foreground">Couldn’t load all connectors</p>
          <Button variant="outline" size="sm" onClick={() => connectors.refetch()}>
            Retry
          </Button>
        </ConnectorsState>
      )}
    </>
  )
}

type ConnectorsStateProps = {
  children: ReactNode
}

function ConnectorsState({ children }: ConnectorsStateProps) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-8 py-12 text-center">
      {children}
    </div>
  )
}

export function ConnectorsSettings() {
  const { workspaceId, provider } = useWorkspaceLayoutCtx()
  const connectors = useWorkspaceMcp(workspaceId, true)

  return (
    <SettingsPage
      title="Connectors"
      description={
        provider === 'codex'
          ? 'Manage your connectors in the ChatGPT app'
          : provider === 'claude-code'
            ? 'Manage your connectors in the Claude app'
            : 'Manage your connectors in your agent’s settings'
      }
    >
      <ConnectorsContent connectors={connectors} />
    </SettingsPage>
  )
}
