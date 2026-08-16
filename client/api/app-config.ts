import { useQuery } from '@tanstack/react-query'

import type { ClientAppConfig } from '@/lib/types'

import { requestJson } from './http'

export const appConfigKeys = {
  all: ['app-config'] as const
}

// Startup config (GET /api/config): frozen for the server process lifetime,
// so it never goes stale and is cached for the whole browser session.
export function useAppConfig() {
  return useQuery<ClientAppConfig>({
    queryKey: appConfigKeys.all,
    queryFn: () => requestJson('/api/config'),
    staleTime: Infinity,
    gcTime: Infinity
  })
}
