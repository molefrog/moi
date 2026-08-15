import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type { AppletThumbnail, AppletThumbnailBatch } from '@/lib/types'

// Freshness records only — image bytes stay server-side (`.moi/.cache`) and
// reach the UI as plain <img> URLs.
export function useAppletThumbnailRecords(workspaceId: string) {
  return useQuery<AppletThumbnail[]>({
    queryKey: workspaceKeys.appletThumbnails(workspaceId),
    queryFn: async () =>
      (
        await requestJson<{ thumbnails: AppletThumbnail[] }>(
          `/api/workspaces/${workspaceId}/applet-thumbnails`
        )
      ).thumbnails,
    ...WORKSPACE_RESOURCE_OPTIONS
  })
}

export function useSaveAppletThumbnails(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation<void, Error, AppletThumbnailBatch>({
    mutationFn: input =>
      requestVoid(
        `/api/workspaces/${workspaceId}/applet-thumbnails`,
        jsonRequest('PUT', input),
        'Failed to save applet thumbnails'
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.appletThumbnails(workspaceId) })
      queryClient.invalidateQueries({ queryKey: workspaceKeys.preview(workspaceId) })
    }
  })
}
