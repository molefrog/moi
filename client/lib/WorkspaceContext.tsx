import { type ReactNode, createContext, useContext } from 'react'

const WorkspaceContext = createContext<string>('default')

export function useWorkspaceId() {
  return useContext(WorkspaceContext)
}

type WorkspaceProps = {
  id: string
  children: ReactNode
}

// Provides the active workspace id to the tree (read by chat + applet hooks).
// Data loading lives in React Query now (see WorkspaceLayoutProvider and the
// useWorkspace* query hooks) — this only carries the id. Applet bundles no
// longer read a window global for their workspace: the serve route bakes the
// API base into each bundle's RPC/fileUrl calls.
export function Workspace({ id, children }: WorkspaceProps) {
  return <WorkspaceContext value={id}>{children}</WorkspaceContext>
}
