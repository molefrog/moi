import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { applyEvents } from '@/lib/format'
import type {
  DiscoveredWorkspace,
  McpServer,
  SessionInfo,
  StreamEvent,
  ThreadConfig,
  ViewInfo,
  ViewState,
  WidgetInfo,
  WorkspaceEntry,
  WorkspaceLayout,
  WorkspaceModels,
  WorkspacePreview,
  WorkspaceType
} from '@/lib/types'

// `/api/workspaces/:id` payload: the persisted layout plus server-resolved
// metadata merged in by the route — `name` (settings override or folder name),
// `cwd` (workspace folder), `provider` (agent backend), and `agentId`.
export type WorkspaceLayoutResponse = WorkspaceLayout & {
  cwd: string
  name: string
  provider?: WorkspaceType
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
  views: (id: string) => ['workspaces', 'views', id] as const,
  sessions: (id: string) => ['workspaces', 'sessions', id] as const,
  // Materialized transcript (ViewState) for one thread. The connection manager
  // patches this cache with live WS deltas; the `['workspaces','events']`
  // prefix lets it invalidate every thread on reconnect.
  events: (id: string, sessionId: string) => ['workspaces', 'events', id, sessionId] as const,
  threadConfig: (id: string, sessionId: string) =>
    ['workspaces', 'threadConfig', id, sessionId] as const,
  mcp: (id: string) => ['workspaces', 'mcp', id] as const,
  models: (id: string) => ['workspaces', 'models', id] as const
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
    queryFn: () => fetch(`/api/workspaces/${workspaceId}`).then(r => r.json()),
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

// Views declared in a workspace (the endpoint wraps them in `{ views }`), in
// nav/manifest order.
export function useWorkspaceViews(workspaceId: string) {
  return useQuery<ViewInfo[]>({
    queryKey: workspaceKeys.views(workspaceId),
    queryFn: () =>
      fetch(`/api/workspaces/${workspaceId}/views`)
        .then(r => r.json())
        .then((d: { views: ViewInfo[] }) => d.views),
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

// A thread's materialized transcript (ViewState), fetched once from `/events`
// and then kept live by WS deltas the connection manager folds in via
// setQueryData. `staleTime: Infinity` + no focus/mount refetch is deliberate:
// the app-wide socket never drops on navigation, so we never miss deltas while
// navigating and must NOT refetch (which would clobber live state). A real
// socket reconnect invalidates these queries to heal any offline gap. New
// (unsent) sessions are primed via setQueryData, so this never fetches an empty
// transcript over their optimistic turn.
export function useSessionView(workspaceId: string, sessionId: string | null) {
  return useQuery<ViewState>({
    queryKey: workspaceKeys.events(workspaceId, sessionId ?? ''),
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}/sessions/${sessionId}/events`)
      const evs: StreamEvent[] = res.ok ? await res.json() : []
      return applyEvents(evs)
    },
    enabled: !!sessionId,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  })
}

// MCP servers configured for a workspace (Claude Code only). Fetching is
// expensive — the server spawns an agent query to probe connection status — so
// this is cache-first: `staleTime`/`gcTime` Infinity means it's fetched once and
// then served from cache, surviving navigation between workspaces (no refetch on
// remount/focus). `enabled` gates it to Claude workspaces.
export function useWorkspaceMcp(workspaceId: string, enabled: boolean) {
  return useQuery<McpServer[]>({
    queryKey: workspaceKeys.mcp(workspaceId),
    queryFn: () => fetch(`/api/workspaces/${workspaceId}/mcp`).then(r => r.json()),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  })
}

// Models the workspace's agent backend can run (normalized across providers by
// the server). Like MCP status, the list is stable per workspace, so it's
// cache-first — fetched once and served from cache across navigation.
export function useWorkspaceModels(workspaceId: string) {
  return useQuery<WorkspaceModels>({
    queryKey: workspaceKeys.models(workspaceId),
    queryFn: () => fetch(`/api/workspaces/${workspaceId}/models`).then(r => r.json()),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  })
}

// Per-thread agent settings (model + reasoning effort). Returns {} for threads
// that never overrode the workspace defaults; the picker falls back to the
// workspace layout defaults for display in that case. Gated on a sessionId so a
// brand-new (unsent) chat — which has no thread id yet — never fetches.
export function useThreadConfig(workspaceId: string, sessionId: string | null) {
  return useQuery<ThreadConfig>({
    queryKey: workspaceKeys.threadConfig(workspaceId, sessionId ?? ''),
    queryFn: () =>
      fetch(`/api/workspaces/${workspaceId}/sessions/${sessionId}/config`).then(r => r.json()),
    enabled: !!sessionId,
    // Cache-first: thread config only changes via this app's own PUTs (which
    // write through the cache), so refetching on every picker (re)mount would
    // just flash the workspace default before the GET resolves. Fetch once per
    // thread, then serve from cache.
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  })
}

// Patch a thread's config (PUT returns the merged result). Writes the merged
// config straight into the query cache so the picker reflects it immediately.
export function useSaveThreadConfig(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation<ThreadConfig, Error, { sessionId: string; patch: ThreadConfig }>({
    mutationFn: async ({ patch, sessionId }) => {
      const res = await fetch(`/api/workspaces/${workspaceId}/sessions/${sessionId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      })
      if (!res.ok) throw new Error('Failed to save thread config')
      return res.json()
    },
    onSuccess: (next, { sessionId }) => {
      qc.setQueryData<ThreadConfig>(workspaceKeys.threadConfig(workspaceId, sessionId), next)
    }
  })
}

// Persist a workspace's layout (widget grid, chat mode, theme). Callers update
// the layout query cache optimistically and use this to write through to the
// server, so it's a plain fire-and-forget PUT with no extra cache work.
export function useSaveLayout(workspaceId: string) {
  return useMutation<void, Error, WorkspaceLayout>({
    mutationFn: async layout => {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
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
