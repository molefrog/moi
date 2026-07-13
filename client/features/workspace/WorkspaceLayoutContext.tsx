import { type ReactNode, createContext, useCallback, useContext, useMemo, useRef } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import {
  type WorkspaceLayoutResponse,
  useSaveLayout,
  useWorkspaceLayout
} from '@/client/features/workspace/api'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type { WorkspaceLayout, WorkspaceType } from '@/lib/types'

const DEFAULT_LAYOUT: WorkspaceLayout = {
  version: 1,
  widgetGrid: [],
  layoutMode: 'fullscreen',
  tabs: { open: ['agent'], active: 'agent' }
}

type WorkspaceLayoutContextValue = {
  // The persisted layout (widget grid, layout mode, theme). Falls back to an
  // empty default while the query is still loading.
  layout: WorkspaceLayout
  // Merge a partial update into the layout: updates the query cache immediately
  // (optimistic) then debounces a PUT to the server via the save mutation.
  setLayout: (update: Partial<WorkspaceLayout>) => void
  // Workspace metadata that rides along on the layout endpoint.
  name: string | null
  // Custom workspace icon (base64 data URL), or null to use the provider icon.
  icon: string | null
  cwd: string | null
  // The agent backend (claude-code / openclaw / hermes …). Exposed here so
  // components like McpMenu read it from the shared layout query instead of
  // spawning their own observer (a second observer that remounts would trigger
  // `refetchOnMount` and clobber an in-flight optimistic layout update).
  provider: WorkspaceType | null
  // The workspace's registry id (the route param), so descendants can key
  // their own queries (e.g. the model picker) without prop-drilling.
  workspaceId: string
  isLoading: boolean
}

const WorkspaceLayoutContext = createContext<WorkspaceLayoutContextValue | null>(null)

export function useWorkspaceLayoutCtx(): WorkspaceLayoutContextValue {
  const ctx = useContext(WorkspaceLayoutContext)
  if (!ctx) throw new Error('useWorkspaceLayoutCtx must be used within <WorkspaceLayoutProvider>')
  return ctx
}

// Strip the server-only metadata so what we PUT back (and expose as `layout`)
// is just the persisted `WorkspaceLayout`.
function stripMeta(data: WorkspaceLayoutResponse): WorkspaceLayout {
  const { cwd: _cwd, name: _name, provider: _provider, agentId: _agentId, ...layout } = data
  return layout
}

type WorkspaceLayoutProviderProps = {
  id: string
  children: ReactNode
}

// Owns the layout query + mutation for a workspace and hands the rest of the
// tree a store-like `{ layout, setLayout }` API backed by React Query.
export function WorkspaceLayoutProvider({ id, children }: WorkspaceLayoutProviderProps) {
  const qc = useQueryClient()
  const query = useWorkspaceLayout(id)
  const save = useSaveLayout(id)

  // `setLayout` must be referentially stable (it feeds effect deps in the grid
  // reconcile), so reach the latest mutate via a ref instead of closing over it.
  const saveRef = useRef(save.mutate)
  saveRef.current = save.mutate
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setLayout = useCallback(
    (update: Partial<WorkspaceLayout>) => {
      const key = workspaceKeys.layout(id)
      const prev = qc.getQueryData<WorkspaceLayoutResponse>(key)
      if (!prev) return
      // Optimistic: the grid/theme reflects the change before the PUT lands.
      qc.setQueryData<WorkspaceLayoutResponse>(key, { ...prev, ...update })

      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        const latest = qc.getQueryData<WorkspaceLayoutResponse>(key)
        if (latest) saveRef.current(stripMeta(latest))
      }, 600)
    },
    [id, qc]
  )

  // Memoized so the context value keeps a stable identity across unrelated
  // renders — otherwise every consumer (WorkspaceView, Widgets, ModelPicker,
  // TurnView, …) would re-render whenever this provider re-renders. `setLayout`
  // is already stable; the rest derive from `query.data`.
  const value = useMemo<WorkspaceLayoutContextValue>(
    () => ({
      layout: query.data ? stripMeta(query.data) : DEFAULT_LAYOUT,
      setLayout,
      name: query.data?.name ?? null,
      icon: query.data?.icon ?? null,
      cwd: query.data?.cwd ?? null,
      provider: query.data?.provider ?? null,
      workspaceId: id,
      isLoading: query.isLoading
    }),
    [query.data, query.isLoading, setLayout, id]
  )

  return <WorkspaceLayoutContext value={value}>{children}</WorkspaceLayoutContext>
}
