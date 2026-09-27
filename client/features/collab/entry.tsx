// The API remains available when presence is disabled, so the same applet can
// render in either mode. The provider starts its transport only when enabled.
import { useSyncExternalStore } from 'react'
import type { WorkspaceTabId } from '@/lib/types'
import { createAppletCollabApi } from './index'
import { useCollabEngine } from './hooks'
import { WorkspaceCollabControls } from './WorkspaceCollabControls'
import type { CollabTabInfo } from './WorkspaceCollabControls'

export type { CollabTabInfo } from './WorkspaceCollabControls'
export { AppletScope, CollabProvider } from './hooks'

export const getAppletCollabApi = createAppletCollabApi

// Identity controls personal navigation and host UI independently of storage.
export function useCollabIdentityEnabled(): boolean {
  const engine = useCollabEngine()
  const identity = useSyncExternalStore(
    engine.subscribeIdentity,
    engine.getIdentity,
    engine.getIdentity
  )
  return engine.enabled && identity !== null
}

export type CollabControlsProps = {
  workspaceId: string
  // Resolves a participant's tab to the label and icon the tab strip uses.
  describeTab: (tab: WorkspaceTabId) => CollabTabInfo | null
  onOpenTab: (tab: WorkspaceTabId) => void
}
export function CollabControls(props: CollabControlsProps) {
  const enabled = useCollabIdentityEnabled()
  return enabled ? <WorkspaceCollabControls {...props} /> : null
}
