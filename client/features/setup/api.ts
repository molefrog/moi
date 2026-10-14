import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { useUiStore } from '@/client/store/ui'
import type {
  DiscoveredWorkspace,
  HarnessAvailability,
  HarnessLogin,
  HarnessLoginState,
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

export type WorkspaceSetupInfo = {
  root: string
  displayRoot: string
  installed: HarnessInstallations
  // Per-backend runtime availability (are the Claude/Codex CLIs installed?),
  // keyed by workspace type. Missing entries mean available.
  availability?: Partial<Record<WorkspaceType, HarnessAvailability>>
}

export function useWorkspaceSetupInfo() {
  return useQuery<WorkspaceSetupInfo>({
    queryKey: workspaceKeys.setupInfo,
    // Availability can change while the app is open (the user installs the
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

export function startHarnessLogin(type: WorkspaceType): Promise<HarnessLogin> {
  return requestJson(
    `/api/harnesses/${type}/auth/login`,
    { method: 'POST' },
    'Could not start sign-in'
  )
}

export type HarnessAuth = {
  availability: HarnessAvailability
  login?: HarnessLoginState
}

export function harnessAuthOptions(type: WorkspaceType) {
  return queryOptions({
    queryKey: ['harness-auth', type],
    queryFn: () => requestJson<HarnessAuth>(`/api/harnesses/${type}/auth`),
    staleTime: 2_000,
    refetchInterval: 2_000
  })
}

export function useHarnessConnection(type: WorkspaceType, enabled = true) {
  return useQuery({ ...harnessAuthOptions(type), enabled })
}

export function submitHarnessLoginCode(type: WorkspaceType, id: string, code: string) {
  return requestVoid(`/api/harnesses/${type}/auth/login/${id}/code`, jsonRequest('POST', { code }))
}

export function cancelHarnessLogin(type: WorkspaceType, id: string) {
  return requestVoid(`/api/harnesses/${type}/auth/login/${id}`, { method: 'DELETE' })
}
