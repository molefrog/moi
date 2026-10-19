import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { useUiStore } from '@/client/store/ui'
import type {
  DiscoveredWorkspace,
  HarnessInstallations,
  WorkspaceEntry,
  WorkspaceType
} from '@/lib/types'

export function upsertWorkspaceEntry(
  entries: WorkspaceEntry[] | undefined,
  entry: WorkspaceEntry
): WorkspaceEntry[] {
  const current = entries ?? []
  const existing = current.findIndex(item => item.id === entry.id || item.path === entry.path)
  if (existing === -1) return [entry, ...current]
  return current.map((item, index) => (index === existing ? { ...item, ...entry } : item))
}

export function useImportWorkspace() {
  const queryClient = useQueryClient()
  return useMutation<WorkspaceEntry, Error, ImportWorkspaceInput>({
    mutationFn: input =>
      requestJson('/api/workspaces', jsonRequest('POST', input), 'Failed to add workspace'),
    onSuccess: (entry, input) => {
      useUiStore.getState().markWorkspacePendingAnalysis(entry.id)
      queryClient.setQueryData<WorkspaceEntry[]>(workspaceKeys.all, previous =>
        upsertWorkspaceEntry(previous, entry)
      )
      queryClient.setQueryData<DiscoveredWorkspace[]>(workspaceKeys.discover, previous =>
        (previous ?? []).filter(item => item.path !== input.path)
      )
    }
  })
}

export type ImportWorkspaceInput = {
  path: string
  type: WorkspaceType
}

export type WorkspaceCreationInfo = {
  installed: HarnessInstallations
}

export function useWorkspaceCreationInfo() {
  return useQuery<WorkspaceCreationInfo>({
    queryKey: workspaceKeys.creationInfo,
    // Installations can change while the app is open (the user installs the
    // agent CLI) — refetch on mount instead of caching forever.
    queryFn: () => requestJson('/api/workspaces/create'),
    staleTime: 30_000,
    refetchOnMount: 'always'
  })
}

export type CreateWorkspaceInput = {
  name: string
  type: WorkspaceType
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient()
  return useMutation<WorkspaceEntry, Error, CreateWorkspaceInput>({
    mutationFn: input =>
      requestJson(
        '/api/workspaces/create',
        jsonRequest('POST', input),
        'Failed to create workspace'
      ),
    onSuccess: entry => {
      queryClient.setQueryData<WorkspaceEntry[]>(workspaceKeys.all, previous =>
        upsertWorkspaceEntry(previous, entry)
      )
    }
  })
}
