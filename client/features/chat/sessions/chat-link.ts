import type { QueryClient } from '@tanstack/react-query'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { workspaceSessionsOptions } from './api'
import { tabAvailable } from '@/client/features/workspace/tab-resolution'
import { isWorkspaceTabId } from '@/lib/workspace-tabs'
import type { SessionInfo, ViewInfo, WorkspaceTabId } from '@/lib/types'

// Metadata alone does not establish existence: the sessions API combines the
// harness's live chat list with moi's attribution records.
export async function resolveChatLink(
  queryClient: QueryClient,
  workspaceId: string,
  sessionId: string,
  views: ViewInfo[],
  signal: AbortSignal
): Promise<WorkspaceTabId | null> {
  signal.throwIfAborted()
  let session = queryClient
    .getQueryData<SessionInfo[]>(workspaceKeys.sessions(workspaceId))
    ?.find(session => session.sessionId === sessionId)
  if (!session) {
    const sessions = await queryClient.fetchQuery(workspaceSessionsOptions(workspaceId))
    session = sessions.find(session => session.sessionId === sessionId)
  }
  signal.throwIfAborted()
  if (!session) return null
  const tab = isWorkspaceTabId(session.tabId) ? session.tabId : 'overview'
  if (!tabAvailable(tab, views)) {
    await queryClient.refetchQueries(
      { queryKey: workspaceKeys.views(workspaceId), exact: true },
      { throwOnError: true }
    )
    signal.throwIfAborted()
    views = queryClient.getQueryData<ViewInfo[]>(workspaceKeys.views(workspaceId)) ?? views
  }
  return tabAvailable(tab, views) ? tab : null
}
