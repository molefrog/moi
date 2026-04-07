import { type ReactNode, createContext, useContext, useEffect } from 'react'

import { useSessionsStore } from '@/client/store/sessions'
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

    // Fire all initial loads in parallel — the app shows a single spinner
    // until all three stores are ready
    useWorkspaceStore.getState().load(id)
    useWidgetsStore.getState().load(id)
    useSessionsStore
      .getState()
      .loadInitial(id)
      .then(() => {
        // After initial load, set the active session to the latest one
        const latest = useSessionsStore.getState().initialSessionId
        if (latest && !useWorkspaceStore.getState().activeSessionId) {
          useWorkspaceStore.getState().setActiveSession(latest)
        }
      })
  }, [id])

  return <WorkspaceContext value={id}>{children}</WorkspaceContext>
}
