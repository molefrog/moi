import { useMutation, useQuery } from '@tanstack/react-query'

import { requestJson } from '@/client/api/http'
import type { UpdateResult, UpdateStatus } from '@/lib/types'

export const updateKey = ['update'] as const

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const RESTART_POLL_INTERVAL_MS = 1000

export function useUpdateStatus(restarting: boolean) {
  return useQuery<UpdateStatus>({
    queryKey: updateKey,
    queryFn: () => requestJson('/api/update'),
    staleTime: UPDATE_CHECK_INTERVAL_MS,
    refetchInterval: restarting ? RESTART_POLL_INTERVAL_MS : UPDATE_CHECK_INTERVAL_MS,
    retry: false
  })
}

export function useUpdate() {
  return useMutation<UpdateResult, Error>({
    mutationFn: () => requestJson('/api/update', { method: 'POST' }, 'Could not update moi')
  })
}
