import { useCollabIdentityEnabled } from '@/client/features/collab/entry'
import { readPersonalSession, writePersonalSession } from '@/client/features/collab/personal-state'
import { useCallback, useMemo } from 'react'

import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'

import { appUiKeys } from '@/client/api/app-ui-keys'
import { jsonRequest, requestJson } from '@/client/api/http'
import { toast } from '@/client/components/ui/toast'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import { useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'
import type { SelectedSessionState } from '@/lib/types'

type SaveSelectedSessionInput = {
  sessionId: string | null
  previousSessionId: string | null
}

type SetSelectedSession = (sessionId: string | null) => void

type SelectedSessionResult = readonly [
  sessionId: string | null | undefined,
  setSessionId: SetSelectedSession
]

export type SelectedSessionSaveResult = 'applied' | 'conflict' | 'ignored'

export function selectedSessionKey(workspaceId: string, personal = false) {
  const key = appUiKeys.selectedSession(workspaceId)
  return personal ? ([...key, 'collab-tab'] as const) : key
}

function selectedSessionMutationKey(workspaceId: string, personal: boolean) {
  return [...selectedSessionKey(workspaceId, personal), 'save'] as const
}

export function optimisticallySetSelectedSession(
  queryClient: QueryClient,
  workspaceId: string,
  sessionId: string | null,
  personal = false
): SaveSelectedSessionInput | null {
  const queryKey = selectedSessionKey(workspaceId, personal)
  const current = queryClient.getQueryData<SelectedSessionState>(queryKey)
  const previousSessionId = current?.sessionId ?? null
  if (current && previousSessionId === sessionId) return null

  queryClient.setQueryData<SelectedSessionState>(queryKey, { sessionId })
  return { sessionId, previousSessionId }
}

export function settleSelectedSessionSave(
  queryClient: QueryClient,
  workspaceId: string,
  saved: SelectedSessionState,
  input: SaveSelectedSessionInput,
  personal = false
): SelectedSessionSaveResult {
  const queryKey = selectedSessionKey(workspaceId, personal)
  const current = queryClient.getQueryData<SelectedSessionState>(queryKey)

  if (saved.sessionId !== input.sessionId && current?.sessionId !== saved.sessionId) {
    return 'conflict'
  }
  if (current?.sessionId !== input.sessionId && current?.sessionId !== input.previousSessionId) {
    return 'ignored'
  }

  queryClient.setQueryData<SelectedSessionState>(queryKey, saved)
  return 'applied'
}

export function applySelectedSessionEvent(
  queryClient: QueryClient,
  workspaceId: string,
  sessionId: string | null,
  hasPendingSave: boolean
): void {
  if (hasPendingSave) return
  queryClient.setQueryData<SelectedSessionState>(appUiKeys.selectedSession(workspaceId), {
    sessionId
  })
}

export function renameSelectedSessionInCache(
  queryClient: QueryClient,
  workspaceId: string,
  from: string,
  to: string
): void {
  for (const personal of [false, true]) {
    queryClient.setQueryData<SelectedSessionState>(
      selectedSessionKey(workspaceId, personal),
      current => (current?.sessionId === from ? { sessionId: to } : current)
    )
  }
  if (readPersonalSession(workspaceId) === from) writePersonalSession(workspaceId, to)
}

export function useSelectedSession(): SelectedSessionResult {
  const workspaceId = useWorkspaceId()
  const collabEnabled = useCollabIdentityEnabled()
  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => selectedSessionKey(workspaceId, collabEnabled),
    [workspaceId, collabEnabled]
  )
  const mutationKey = useMemo(
    () => selectedSessionMutationKey(workspaceId, collabEnabled),
    [workspaceId, collabEnabled]
  )
  const pendingSaves = useIsMutating({ mutationKey, exact: true })

  // WorkspaceLoader remains an observer for the active workspace. Nested hook
  // users reuse its result without refetching; once the route unmounts, dropping
  // the cache makes the next visit load the server-owned selection again.
  const query = useQuery<SelectedSessionState>({
    queryKey,
    queryFn: () =>
      collabEnabled
        ? Promise.resolve({ sessionId: readPersonalSession(workspaceId) })
        : requestJson(`/api/workspaces/${workspaceId}/selected-session`),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  })

  const { mutate: saveSelectedSession } = useMutation<
    SelectedSessionState,
    Error,
    SaveSelectedSessionInput
  >({
    mutationKey,
    scope: { id: `selected-session:${workspaceId}` },
    mutationFn: input => {
      if (collabEnabled) {
        writePersonalSession(workspaceId, input.sessionId)
        return Promise.resolve({ sessionId: input.sessionId })
      }
      return requestJson<SelectedSessionState>(
        `/api/workspaces/${workspaceId}/selected-session`,
        jsonRequest('PUT', input),
        'Couldn’t save selected chat'
      )
    },
    onSuccess: (saved, input) => {
      const result = settleSelectedSessionSave(
        queryClient,
        workspaceId,
        saved,
        input,
        collabEnabled
      )
      if (result !== 'conflict') return

      toast.add({ title: 'Couldn’t save selected chat', type: 'error' })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (_error, input) => {
      const current = queryClient.getQueryData<SelectedSessionState>(queryKey)
      if (current?.sessionId !== input.sessionId) return

      toast.add({ title: 'Couldn’t save selected chat', type: 'error' })
      queryClient.invalidateQueries({ queryKey })
    }
  })

  const setSelectedSessionId = useCallback<SetSelectedSession>(
    sessionId => {
      const input = optimisticallySetSelectedSession(
        queryClient,
        workspaceId,
        sessionId,
        collabEnabled
      )
      if (input) saveSelectedSession(input)
    },
    [queryClient, saveSelectedSession, workspaceId, collabEnabled]
  )

  useWorkspaceEvent(event => {
    if (
      collabEnabled ||
      event.type !== 'selected-session:updated' ||
      event.workspaceId !== workspaceId
    )
      return
    applySelectedSessionEvent(queryClient, workspaceId, event.sessionId, pendingSaves > 0)
  })

  const selectedSessionId = query.isLoading ? undefined : (query.data?.sessionId ?? null)
  return [selectedSessionId, setSelectedSessionId]
}
