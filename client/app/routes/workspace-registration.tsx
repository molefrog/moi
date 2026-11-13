import { useAppConfig } from '@/client/api/app-config'
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useSearch } from 'wouter'
import { SidebarLayout } from '../shell/sidebar-layout'
import { requestJson, jsonRequest } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import {
  WorkspaceOpenError,
  WorkspaceLoadingState
} from '@/client/features/workspace/setup/workspace-recovery-states'
import { WorkspacePendingScreen } from '@/client/features/workspace/workspace-pending-screen'
import type { WorkspaceEntry } from '@/lib/types'
import { workspaceApiBase } from '@/lib/workspace-config'
import { workspaceInfoOptions } from '@/client/features/workspace/api'

type WorkspaceRegistrationProps = { userId: string; workspaceId: string }
export function WorkspaceRegistration({ userId, workspaceId }: WorkspaceRegistrationProps) {
  const cloud = useAppConfig().environment === 'cloud'
  const [location, navigate] = useLocation()
  const search = useSearch()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['open-shared-workspace', userId, workspaceId],
    queryFn: async () => {
      // Recheck access even if discovery already cached the owner's info.
      await client.fetchQuery({
        ...workspaceInfoOptions(workspaceApiBase(workspaceId, userId)),
        staleTime: 0
      })
      return requestJson<WorkspaceEntry>(
        '/api/workspaces/shared/open',
        jsonRequest('POST', { user_id: userId, workspace_id: workspaceId })
      )
    },
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
    const destination = location.replace(/^\/workspace\/[^/]+/, `/workspace/${query.data.id}`)
    navigate(`${destination}${search ? `?${search}` : ''}`, { replace: true })
  }, [query.data, client, navigate, cloud, location, search])
  return (
    <SidebarLayout>
      <WorkspacePendingScreen setupRequired={query.isError}>
        {query.isError ? (
          <WorkspaceOpenError
            error={query.error}
            retrying={query.isFetching}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <div className="flex flex-1" role="status" aria-label="Opening shared workspace">
            <WorkspaceLoadingState />
          </div>
        )}
      </WorkspacePendingScreen>
    </SidebarLayout>
  )
}
