import { useMutation, useQuery } from '@tanstack/react-query'

import { requestJson } from '@/client/api/http'
import type { UpdateResult, UpdateStatus } from '@/lib/types'

export const updateKey = ['update'] as const

// The server decides how often the npm registry is actually consulted and
// serves a cached answer in between, so polling here is a local memory read.
// Keep it frequent enough that a tab left open all day stays current — and note
// React Query pauses intervals while the tab is hidden, so a background window
// costs nothing and catches up on focus instead.
const UPDATE_POLL_INTERVAL_MS = 5 * 60 * 1000
const RESTART_POLL_INTERVAL_MS = 1000

export function useUpdateStatus(restarting: boolean) {
  return useQuery<UpdateStatus>({
    queryKey: updateKey,
    queryFn: () => requestJson('/api/update'),
    staleTime: UPDATE_POLL_INTERVAL_MS,
    refetchInterval: restarting ? RESTART_POLL_INTERVAL_MS : UPDATE_POLL_INTERVAL_MS,
    // A tab that sat in the background for days is stale by definition; give it
    // a fresh answer the moment someone looks at it.
    refetchOnWindowFocus: true,
    // While the server is restarting every request fails until it is back. The
    // poll interval is the retry.
    retry: false
  })
}

export function useUpdate() {
  return useMutation<UpdateResult, Error>({
    mutationFn: () => requestJson('/api/update', { method: 'POST' }, 'Could not update moi')
  })
}
