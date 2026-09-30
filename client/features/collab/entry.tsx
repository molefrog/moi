// The API remains available when presence is disabled, so the same applet can
// render in either mode. The provider starts its transport only when enabled.
import { useSyncExternalStore } from 'react'
import type { WorkspaceTabId } from '@/lib/types'
import { createAppletCollabApi } from './index'
import { useCollabEngine } from './hooks'
import { WorkspaceCollabControls } from './WorkspaceCollabControls'
import type { TabInfo } from './WorkspaceCollabControls'

export type { TabInfo } from './WorkspaceCollabControls'
export type { AppletCollabApi } from './index'
export { AppletScope, CollabProvider } from './hooks'

export const getAppletCollabApi = createAppletCollabApi

// Collab controls and browser-tab selection require both runtime support and a current user.
export function useCollabEnabled(): boolean {
  const engine = useCollabEngine()
  const currentUser = useSyncExternalStore(
    engine.subscribeCurrentUser,
    engine.getCurrentUser,
    engine.getCurrentUser
  )
  return engine.enabled && currentUser !== undefined
}

export type CollabControlsProps = {
  workspaceId: string
  // Resolves a connection's tab to the label and icon the tab strip uses.
  describeTab: (tab: WorkspaceTabId) => TabInfo | null
  onOpenTab: (tab: WorkspaceTabId) => void
}
export function CollabControls(props: CollabControlsProps) {
  const enabled = useCollabEnabled()
  return enabled ? <WorkspaceCollabControls {...props} /> : null
}
