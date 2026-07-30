import { type ReactNode, createContext, useCallback, useContext, useMemo, useRef } from 'react'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { toast } from '@/client/components/ui/toast'
import { useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'
import type { SelectedSessionState } from '@/lib/types'

type SelectSessionInput = {
  sessionId: string | null
  previousSessionId: string | null
}

type SelectedSessionContextValue = {
  isLoading: boolean
  selectedSessionId: string | null
  selectSession: (sessionId: string | null) => void
}

const SelectedSessionContext = createContext<SelectedSessionContextValue | null>(null)

export function useSelectedSession(): SelectedSessionContextValue {
  const context = useContext(SelectedSessionContext)
  if (!context) {
    throw new Error('useSelectedSession must be used within <SelectedSessionProvider>')
  }
  return context
}

type SelectedSessionProviderProps = {
  children: ReactNode
  workspaceId: string
}

export function SelectedSessionProvider({ children, workspaceId }: SelectedSessionProviderProps) {
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => workspaceKeys.selectedSession(workspaceId), [workspaceId])
  const desiredSessionIdRef = useRef<string | null | undefined>(undefined)

  const query = useQuery<SelectedSessionState>({
    queryKey,
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}/selected-session`),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false
  })

  const save = useMutation<SelectedSessionState, Error, SelectSessionInput>({
    mutationKey: ['selected-session', workspaceId],
    scope: { id: `selected-session:${workspaceId}` },
    mutationFn: input =>
      requestJson(
        `/api/workspaces/${workspaceId}/selected-session`,
        jsonRequest('PUT', input),
        'Couldn’t save selected chat'
      ),
    onSuccess: (saved, input) => {
      if (desiredSessionIdRef.current !== input.sessionId) return

      const current = queryClient.getQueryData<SelectedSessionState>(queryKey)
      if (saved.sessionId !== input.sessionId && current?.sessionId !== saved.sessionId) {
        desiredSessionIdRef.current = undefined
        toast.add({ title: 'Couldn’t save selected chat', type: 'error' })
        queryClient.invalidateQueries({ queryKey })
        return
      }

      desiredSessionIdRef.current = undefined
      if (
        current?.sessionId === input.sessionId ||
        current?.sessionId === input.previousSessionId
      ) {
        queryClient.setQueryData(queryKey, saved)
      }
    },
    onError: (_error, input) => {
      if (desiredSessionIdRef.current !== input.sessionId) return
      desiredSessionIdRef.current = undefined
      toast.add({ title: 'Couldn’t save selected chat', type: 'error' })
      queryClient.invalidateQueries({ queryKey })
    }
  })

  const saveRef = useRef(save.mutate)
  saveRef.current = save.mutate

  const selectSession = useCallback(
    (sessionId: string | null) => {
      const previousSessionId =
        queryClient.getQueryData<SelectedSessionState>(queryKey)?.sessionId ?? null
      if (previousSessionId === sessionId) return

      desiredSessionIdRef.current = sessionId
      queryClient.setQueryData<SelectedSessionState>(queryKey, { sessionId })
      saveRef.current({ sessionId, previousSessionId })
    },
    [queryClient, queryKey]
  )

  useWorkspaceEvent(event => {
    if (
      event.type !== 'selected-session:updated' ||
      event.workspaceId !== workspaceId ||
      desiredSessionIdRef.current !== undefined
    ) {
      return
    }
    queryClient.setQueryData<SelectedSessionState>(queryKey, {
      sessionId: event.sessionId
    })
  })

  const value = useMemo<SelectedSessionContextValue>(
    () => ({
      isLoading: query.isLoading,
      selectedSessionId: query.data?.sessionId ?? null,
      selectSession
    }),
    [query.data?.sessionId, query.isLoading, selectSession]
  )

  return <SelectedSessionContext value={value}>{children}</SelectedSessionContext>
}

export function renameSelectedSessionInCache(
  queryClient: QueryClient,
  workspaceId: string,
  from: string,
  to: string
): void {
  queryClient.setQueryData<SelectedSessionState>(
    workspaceKeys.selectedSession(workspaceId),
    current => (current?.sessionId === from ? { sessionId: to } : current)
  )
}
