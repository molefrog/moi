import { useEffect } from 'react'
import { matchQuery, useQueryClient, type QueryClient, type Query } from '@tanstack/react-query'
import { useWorkspaceEvent } from '@/client/runtime/use-workspace-events'
import type { WorkspaceLayoutResponse, WorkspaceType } from '@/lib/types'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { liveStore } from '@/client/features/chat/chat-store'
import { writeSelectedSession } from '@/client/features/chat/sessions/browser-tab-state'
import { browserTabSelectionKey } from '@/client/features/chat/sessions/use-selected-session'
import { changeWorkspaceStateCache } from './workspace-state'

export async function receiveWorkspaceHarness(
  queryClient: QueryClient,
  id: string,
  harness: WorkspaceType
) {
  const cached = queryClient.getQueryData<WorkspaceLayoutResponse>(workspaceKeys.layout(id))
  let previous = cached ? (cached.provider ?? 'claude-code') : undefined
  try {
    const key = `moi:workspace-harness:${id}`
    previous = (sessionStorage.getItem(key) as WorkspaceType | null) ?? previous
    sessionStorage.setItem(key, harness)
  } catch {
    /* Cached layout still detects live changes when storage is unavailable. */
  }
  if (!previous || previous === harness) return

  const keys = [
    workspaceKeys.layout(id),
    workspaceKeys.state(id),
    workspaceKeys.sessions(id),
    workspaceKeys.mcp(id),
    workspaceKeys.skills(id),
    workspaceKeys.views(id),
    ['workspaces', 'events', id]
  ]
  const affected = {
    predicate: (query: Query) => keys.some(queryKey => matchQuery({ queryKey }, query))
  }
  await queryClient.cancelQueries(affected)
  // Discard the old provider snapshot before rendering the new harness status.
  void queryClient.resetQueries({ queryKey: workspaceKeys.harness(id), exact: true })
  queryClient.setQueryData<WorkspaceLayoutResponse>(workspaceKeys.layout(id), previous =>
    previous
      ? {
          ...previous,
          provider: harness,
          selectedModel: undefined,
          selectedEffort: undefined,
          selectedFastMode: undefined
        }
      : previous
  )
  writeSelectedSession(id, { selected: {} })
  queryClient.setQueryData(browserTabSelectionKey(id), { selected: {} })
  changeWorkspaceStateCache(queryClient, id, state => {
    state.selected = {}
    delete state.pinnedSessionId
  })
  const clean = <T>(entries: Record<string, T>) =>
    Object.fromEntries(Object.entries(entries).filter(([key]) => !key.startsWith(`${id}:`)))
  liveStore.setState(state => ({
    activity: clean(state.activity),
    errors: clean(state.errors),
    previews: Object.fromEntries(
      Object.entries(state.previews).filter(([, preview]) => preview.workspaceId !== id)
    )
  }))
  queryClient.removeQueries({ queryKey: ['workspaces', 'events', id] })
  await Promise.all([
    queryClient.invalidateQueries(affected),
    queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true }),
    queryClient.invalidateQueries({ queryKey: workspaceKeys.previews })
  ])
}

export function useWorkspaceHarnessChanges(id: string, harness: WorkspaceType | null) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (harness) void receiveWorkspaceHarness(queryClient, id, harness)
  }, [harness, id, queryClient])
  useWorkspaceEvent(event => {
    if (event.type === 'connection:opened') {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.layout(id) })
    } else if (event.type === 'workspace-harness:switched' && event.workspaceId === id) {
      void receiveWorkspaceHarness(queryClient, id, event.harness)
    }
  })
}
