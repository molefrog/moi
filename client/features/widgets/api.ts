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
      // The timestamp too — without it the cached layout keeps the old age
      // and the capture hook would immediately re-run the pass. The server
      // stamps its own clock on disk; this local echo holds until a refetch.
      queryClient.setQueryData<WorkspaceLayoutResponse>(workspaceKeys.layout(workspaceId), prev =>
        prev ? { ...prev, widgetThumbnails: { key, at: new Date().toISOString() } } : prev
      )
    },
    onSuccess: () => {
      // The home card's preview is served from what this PUT just wrote; its
      // query has a staleTime, so without an explicit invalidation a quick
      // hop back to the home screen would keep showing the pre-capture state.
      queryClient.invalidateQueries({ queryKey: workspaceKeys.preview(workspaceId) })
    }
  })
}
