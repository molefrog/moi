import { type ReactNode, createContext, useContext, useEffect } from 'react'

const WorkspaceContext = createContext<string>('default')

export function useWorkspaceId() {
  return useContext(WorkspaceContext)
}

type WorkspaceProps = {
  id: string
  children: ReactNode
}

// Provides the active workspace id to the tree (read by chat + widget hooks).
// Data loading lives in React Query now (see WorkspaceLayoutProvider and the
// useWorkspace* query hooks) — this only carries the id.
export function Workspace({ id, children }: WorkspaceProps) {
  useEffect(() => {
    // Expose to widget RPC bundles
    ;(window as unknown as Record<string, unknown>).__MEI_WS__ = id
  }, [id])

  return <WorkspaceContext value={id}>{children}</WorkspaceContext>
}
