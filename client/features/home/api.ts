import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { liveStore } from '@/client/features/chat/chat-store'
import { useUiStore } from '@/client/store/ui'
import type {
  DiscoveredWorkspace,
  HarnessAvailability,
  WorkspaceEntry,
  WorkspacePreview,
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

export function useWorkspaces() {
  return useQuery<WorkspaceEntry[]>({
    queryKey: workspaceKeys.all,
    queryFn: () => requestJson('/api/workspaces'),
    staleTime: Infinity,
    refetchOnMount: 'always'
  })
}

export function useWorkspacePreview(workspaceId: string) {
  return useQuery<WorkspacePreview>({
    queryKey: workspaceKeys.preview(workspaceId),
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}/preview`),
    staleTime: 60_000
  })
}

export function useDiscoveredWorkspaces() {
  return useQuery<DiscoveredWorkspace[]>({
    queryKey: workspaceKeys.discover,
    queryFn: () => requestJson('/api/workspaces/discover')
  })
}

export function useImportWorkspace() {
  const queryClient = useQueryClient()
  return useMutation<WorkspaceEntry, Error, ImportWorkspaceInput>({
    mutationFn: input =>
      requestJson('/api/workspaces', jsonRequest('POST', input), 'Failed to add workspace'),
    onSuccess: (entry, input) => {
      liveStore.getState().setActive(entry.id, null)
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
  canChooseFolder: boolean
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

export type ChooseFolderResult = DiscoveredWorkspace | { canceled: true }

export function useChooseFolder() {
  return useMutation<ChooseFolderResult, Error, void>({
    mutationFn: () =>
      requestJson('/api/workspaces/choose-folder', { method: 'POST' }, 'Failed to choose folder')
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

export function useReorderWorkspaces() {
  const queryClient = useQueryClient()
  return useMutation<WorkspaceEntry[], Error, string[], { previous?: WorkspaceEntry[] }>({
    mutationFn: ids =>
      requestJson('/api/workspaces/order', jsonRequest('PUT', { ids }), 'Failed to reorder spaces'),
    onMutate: async ids => {
      // Exact: only pause the workspace list itself — a prefix cancel would
      // abort unrelated in-flight fetches (transcripts, widgets) that never
      // retry on their own.
      await queryClient.cancelQueries({ queryKey: workspaceKeys.all, exact: true })
      const previous = queryClient.getQueryData<WorkspaceEntry[]>(workspaceKeys.all)
      if (previous) {
        const byId = new Map(previous.map(entry => [entry.id, entry]))
        const ordered = ids
          .map(id => byId.get(id))
          .filter((entry): entry is WorkspaceEntry => Boolean(entry))
        if (ordered.length === previous.length) {
          queryClient.setQueryData(workspaceKeys.all, ordered)
        }
      }
      return { previous }
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(workspaceKeys.all, context.previous)
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true })
    },
    onSuccess: entries => {
      queryClient.setQueryData(workspaceKeys.all, entries)
    }
  })
}

export function useRemoveWorkspace() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: workspaceId =>
      requestVoid(
        `/api/workspaces/${workspaceId}`,
        { method: 'DELETE' },
        'Failed to remove workspace'
      ),
    onSuccess: (_result, workspaceId) => {
      queryClient.setQueryData<WorkspaceEntry[]>(workspaceKeys.all, previous =>
        (previous ?? []).filter(workspace => workspace.id !== workspaceId)
      )
      queryClient.invalidateQueries({ queryKey: workspaceKeys.discover })
    }
  })
}
