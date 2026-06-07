import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { DiscoveredWorkspace, WorkspaceEntry } from '@/lib/types'

// Central query-key registry for the workspaces domain. Both the `/` view and
// the sidebar read from these keys, so the cache is shared.
export const workspaceKeys = {
  all: ['workspaces'] as const,
  discover: ['workspaces', 'discover'] as const
}

// Registered workspaces (the contents of workspaces.json).
//
// Cache-first: the list rarely changes, so `staleTime: Infinity` keeps it cached
// indefinitely (no focus/interval refetch churn) and mutations below keep it
// current. `refetchOnMount: 'always'` still fires a background refetch on every
// (re)mount — e.g. when the Sidebar remounts on collapse — while showing the
// cached data immediately, so the rows never flicker empty.
export function useWorkspaces() {
  return useQuery<WorkspaceEntry[]>({
    queryKey: workspaceKeys.all,
    queryFn: () => fetch('/api/workspaces').then(r => r.json()),
    staleTime: Infinity,
    refetchOnMount: 'always'
  })
}

// CC / OpenClaw directories found on the machine but not yet registered.
export function useDiscoveredWorkspaces() {
  return useQuery<DiscoveredWorkspace[]>({
    queryKey: workspaceKeys.discover,
    queryFn: () => fetch('/api/workspaces/discover').then(r => r.json())
  })
}

// Import a discovered workspace into the registry (optimistically move it from
// the discover list into the registered list).
export function useAddWorkspace() {
  const qc = useQueryClient()
  return useMutation<WorkspaceEntry, Error, DiscoveredWorkspace>({
    mutationFn: async discovered => {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discovered)
      })
      return res.json()
    },
    onSuccess: (entry, suggestion) => {
      qc.setQueryData<WorkspaceEntry[]>(workspaceKeys.all, prev => [...(prev ?? []), entry])
      qc.setQueryData<DiscoveredWorkspace[]>(workspaceKeys.discover, prev =>
        (prev ?? []).filter(s => s.path !== suggestion.path)
      )
    }
  })
}

// Remove a workspace from the registry (re-discovery may surface it again).
export function useRemoveWorkspace() {
  const qc = useQueryClient()
  return useMutation<void, Error, WorkspaceEntry>({
    mutationFn: async entry => {
      const res = await fetch(`/api/workspaces/${entry.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove workspace')
    },
    onSuccess: (_void, entry) => {
      qc.setQueryData<WorkspaceEntry[]>(workspaceKeys.all, prev =>
        (prev ?? []).filter(w => w.id !== entry.id)
      )
      qc.invalidateQueries({ queryKey: workspaceKeys.discover })
    }
  })
}
