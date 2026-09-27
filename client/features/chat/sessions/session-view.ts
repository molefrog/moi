import { queryOptions, type QueryClient } from '@tanstack/react-query'

import { requestJson } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { applyEvents } from '@/lib/format'
import type { StreamEvent } from '@/lib/types'

type PendingFetch = {
  workspaceId: string
  sessionId: string
  events: StreamEvent[]
}

const pendingFetches = new WeakMap<QueryClient, Set<PendingFetch>>()

// Keep socket events that arrive after an HTTP snapshot starts loading. This
// also covers the first load, before there is any cached view to patch.
export function bufferSessionEvent(
  client: QueryClient,
  workspaceId: string,
  sessionId: string,
  event: StreamEvent
) {
  for (const pending of pendingFetches.get(client) ?? []) {
    if (pending.workspaceId === workspaceId && pending.sessionId === sessionId) {
      pending.events.push(event)
    }
  }
}

export function sessionViewOptions(workspaceId: string, sessionId: string) {
  return queryOptions({
    queryKey: workspaceKeys.events(workspaceId, sessionId),
    queryFn: async ({ client, signal }) => {
      const requests = pendingFetches.get(client) ?? new Set<PendingFetch>()
      pendingFetches.set(client, requests)
      const pending: PendingFetch = { workspaceId, sessionId, events: [] }
      requests.add(pending)
      try {
        const events = await requestJson<StreamEvent[]>(
          `/api/workspaces/${workspaceId}/sessions/${sessionId}/events`,
          { signal },
          'Couldn’t load chat'
        )
        return applyEvents([...events, ...pending.events])
      } finally {
        requests.delete(pending)
      }
    },
    staleTime: Infinity,
    gcTime: 5 * 60_000
  })
}
