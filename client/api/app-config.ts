import { useEffect } from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { ClientAppConfig } from '@/lib/types'

import { onWorkspaceEventsReconnect } from '@/client/runtime/useWorkspaceEvents'

import { requestJson } from './http'

export const appConfigKeys = {
  all: ['app-config'] as const
}

// Startup config (GET /api/config): frozen for the server process lifetime,
// so it never goes stale within one server run. The one thing that can change
// it is a server restart — the events socket reconnecting is that signal, so
// refetch there instead of on a timer.
export function useAppConfig() {
  const queryClient = useQueryClient()

  useEffect(
    () =>
      onWorkspaceEventsReconnect(() => {
        queryClient.invalidateQueries({ queryKey: appConfigKeys.all })
      }),
    [queryClient]
  )

  return useQuery<ClientAppConfig>({
    queryKey: appConfigKeys.all,
    queryFn: () => requestJson('/api/config'),
    staleTime: Infinity,
    gcTime: Infinity
  })
}
