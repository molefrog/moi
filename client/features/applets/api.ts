import { useMutation, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestVoid } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type { AppletThumbnailBatch } from '@/lib/types'

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
      queryClient.invalidateQueries({ queryKey: workspaceKeys.layout(workspaceId) })
      queryClient.invalidateQueries({ queryKey: workspaceKeys.preview(workspaceId) })
    }
  })
}
