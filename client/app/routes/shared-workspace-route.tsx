import { useAppConfig } from '@/client/api/app-config'
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'wouter'
import { SidebarLayout } from '../shell/sidebar-layout'
import { requestJson, jsonRequest } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import {
  RecoveryMessage,
  WorkspaceLoadingState
} from '@/client/features/workspace/setup/workspace-recovery-states'
import { WorkspacePendingScreen } from '@/client/features/workspace/workspace-pending-screen'
import type { WorkspaceEntry } from '@/lib/types'

type SharedWorkspaceRouteProps = { userId: string; workspaceId: string }
export function SharedWorkspaceRoute({ userId, workspaceId }: SharedWorkspaceRouteProps) {
  const cloud = useAppConfig().environment === 'cloud'
  const [, navigate] = useLocation()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['open-shared-workspace', userId, workspaceId],
    queryFn: () =>
      requestJson<WorkspaceEntry>(
        '/api/workspaces/shared/open',
        jsonRequest('POST', { user_id: userId, workspace_id: workspaceId })
      ),
    enabled: cloud,
    retry: false,
    refetchOnWindowFocus: false,
    gcTime: 0
  })
  useEffect(() => {
    if (!cloud) {
      navigate('/', { replace: true })
      return
    }
    if (!query.data) return
    void client.invalidateQueries({ queryKey: workspaceKeys.all })
    navigate(`/workspace/${query.data.id}`, { replace: true })
  }, [query.data, client, navigate, cloud])
  return (
    <SidebarLayout>
      <WorkspacePendingScreen setupRequired={query.isError}>
        {query.isError ? (
          <RecoveryMessage
            title="Couldn’t open workspace"
            retrying={query.isFetching}
            onRetry={() => void query.refetch()}
          >
            {query.error.message}
            <br />
            <Link href="/">Back</Link>
          </RecoveryMessage>
        ) : (
          <div className="flex flex-1" role="status" aria-label="Opening shared workspace">
            <WorkspaceLoadingState />
          </div>
        )}
      </WorkspacePendingScreen>
    </SidebarLayout>
  )
}
