import { useMutation, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestVoid } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type { WorkspaceLayoutResponse } from '@/client/features/workspace/api'

export type SaveWidgetThumbnailsInput = {
  // Fingerprint of the grid state the set was captured from — see
  // widgetThumbnailsKey().
  key: string
  // Widget id → WebP data URL. Merged server-side, never pruned.
  thumbnails: Record<string, string>
}

// Persist captured widget thumbnails. Separate from the layout PUT so grid and
// theme saves never carry the base64 map; the server merges the entries into
// `.workspace.json` (PUT /api/workspaces/:id/thumbnails).
//
// The local layout cache gets the new key in onMutate, deliberately WITHOUT a
// rollback on error: a failed save must read as fresh locally, or the capture
// hook would re-run a full pass every SETTLE_MS until the server recovers.
// Worst case the thumbnails are re-captured after a reload.
export function useSaveWidgetThumbnails(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, SaveWidgetThumbnailsInput>({
    mutationFn: ({ key, thumbnails }) =>
      requestVoid(
        `/api/workspaces/${workspaceId}/thumbnails`,
        jsonRequest('PUT', { key, thumbnails }),
        'Failed to save thumbnails'
      ),
    onMutate: ({ key }) => {
      queryClient.setQueryData<WorkspaceLayoutResponse>(workspaceKeys.layout(workspaceId), prev =>
        prev ? { ...prev, widgetThumbnailsKey: key } : prev
      )
    }
  })
}
