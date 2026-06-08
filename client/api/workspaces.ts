import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  DiscoveredWorkspace,
  SessionInfo,
  WidgetInfo,
  WorkspaceEntry,
  WorkspaceLayout,
  WorkspacePreview
} from '@/lib/types'

// Layout endpoint payload: the persisted layout plus server-resolved metadata
// (`cwd`, `name`, `agentId`) merged in by the route.
export type WorkspaceLayoutResponse = WorkspaceLayout & {
  cwd: string
  name: string
  agentId?: string
}

// Central query-key registry for the workspaces domain. Both the `/` view and
// the sidebar read from these keys, so the cache is shared.
export const workspaceKeys = {
  all: ['workspaces'] as const,
  discover: ['workspaces', 'discover'] as const,
  preview: (id: string) => ['workspaces', 'preview', id] as const,
  layout: (id: string) => ['workspaces', 'layout', id] as const,
  widgets: (id: string) => ['workspaces', 'widgets', id] as const,
  sessions: (id: string) => ['workspaces', 'sessions', id] as const
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

// Per-workspace dashboard preview (widget grid thumbnail).
export function useWorkspacePreview(workspaceId: string) {
  return useQuery<WorkspacePreview>({
    queryKey: workspaceKeys.preview(workspaceId),
    queryFn: () => fetch(`/api/workspaces/${workspaceId}/preview`).then(r => r.json()),
    staleTime: 60_000
  })
}

// Shared freshness policy for a workspace's resources: always considered stale
// (`staleTime: 0`) so every (re)mount and window-focus refetches in the
// background, while `gcTime` keeps the data cached when you switch to another
// workspace and back — so the panel shows instantly, then revalidates.
const WORKSPACE_RESOURCE_OPTS = {
  staleTime: 0,
  gcTime: 5 * 60_000,
  refetchOnMount: true,
  refetchOnWindowFocus: true
} as const

// Persisted layout + workspace metadata for a single workspace.
export function useWorkspaceLayout(workspaceId: string) {
  return useQuery<WorkspaceLayoutResponse>({
    queryKey: workspaceKeys.layout(workspaceId),
    queryFn: () => fetch(`/api/workspaces/${workspaceId}/layout`).then(r => r.json()),
    ...WORKSPACE_RESOURCE_OPTS
  })
}

// Widgets declared in a workspace (the endpoint wraps them in `{ widgets }`).
export function useWorkspaceWidgets(workspaceId: string) {
  return useQuery<WidgetInfo[]>({
    queryKey: workspaceKeys.widgets(workspaceId),
    queryFn: () =>
      fetch(`/api/workspaces/${workspaceId}/widgets`)
        .then(r => r.json())
        .then((d: { widgets: WidgetInfo[] }) => d.widgets),
    ...WORKSPACE_RESOURCE_OPTS
  })
}

// Sessions (chat threads) available in a workspace, latest first.
export function useWorkspaceSessions(workspaceId: string) {
  return useQuery<SessionInfo[]>({
    queryKey: workspaceKeys.sessions(workspaceId),
    queryFn: () => fetch(`/api/workspaces/${workspaceId}/sessions`).then(r => r.json()),
    ...WORKSPACE_RESOURCE_OPTS
  })
}

// Persist a workspace's layout (widget grid, chat mode, theme). Callers update
// the layout query cache optimistically and use this to write through to the
// server, so it's a plain fire-and-forget PUT with no extra cache work.
export function useSaveLayout(workspaceId: string) {
  return useMutation<void, Error, WorkspaceLayout>({
    mutationFn: async layout => {
      const res = await fetch(`/api/workspaces/${workspaceId}/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(layout)
      })
      if (!res.ok) throw new Error('Failed to save layout')
    }
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
