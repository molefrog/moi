import { type ReactNode, createContext, useContext, useEffect } from 'react'

import { useWidgetsStore } from '@/client/store/widgets'
import { useWorkspaceStore } from '@/client/store/workspace'

const WorkspaceContext = createContext<string>('default')

export function useWorkspaceId() {
  return useContext(WorkspaceContext)
}

type WorkspaceProps = {
  id: string
  children: ReactNode
}

export function Workspace({ id, children }: WorkspaceProps) {
  useEffect(() => {
    // Expose to widget RPC bundles
    ;(window as unknown as Record<string, unknown>).__MEI_WS__ = id

    useWorkspaceStore.getState().load(id)
    useWidgetsStore.getState().load(id)
  }, [id])

  return <WorkspaceContext value={id}>{children}</WorkspaceContext>
}
