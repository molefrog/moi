import { type ReactNode, createContext, useCallback, useContext, useRef } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import {
  type WorkspaceLayoutResponse,
  useSaveLayout,
  useWorkspaceLayout,
  workspaceKeys
} from '@/client/api/workspaces'
import type { WorkspaceLayout } from '@/lib/types'

const DEFAULT_LAYOUT: WorkspaceLayout = {
  version: 1,
  widgetGrid: [],
  chatMode: 'sidebar'
}

type WorkspaceLayoutContextValue = {
  // The persisted layout (widget grid, chat mode, theme). Falls back to an
  // empty default while the query is still loading.
  layout: WorkspaceLayout
  // Merge a partial update into the layout: updates the query cache immediately
  // (optimistic) then debounces a PUT to the server via the save mutation.
  setLayout: (update: Partial<WorkspaceLayout>) => void
  // Workspace metadata that rides along on the layout endpoint.
  name: string | null
  cwd: string | null
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
  const { cwd: _cwd, name: _name, agentId: _agentId, ...layout } = data
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

  const value: WorkspaceLayoutContextValue = {
    layout: query.data ? stripMeta(query.data) : DEFAULT_LAYOUT,
    setLayout,
    name: query.data?.name ?? null,
    cwd: query.data?.cwd ?? null,
    isLoading: query.isLoading
  }

  return <WorkspaceLayoutContext value={value}>{children}</WorkspaceLayoutContext>
}
