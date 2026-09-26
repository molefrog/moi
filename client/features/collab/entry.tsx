// The API remains available when presence is disabled, so the same applet can
// render in either mode. The provider starts its transport only when enabled.
import { Component, createContext, useContext, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { AppletKind, WorkspaceTabId } from '@/lib/types'
import { AppletCollabProvider, CollabWorkspaceProvider, createAppletCollabApi } from './index'
import { getIdentity, subscribeIdentityStore } from './identity'
import { WorkspaceCollabControls } from './WorkspaceCollabControls'
import type { CollabTabInfo } from './WorkspaceCollabControls'

export type { CollabTabInfo } from './WorkspaceCollabControls'

const EnabledContext = createContext(false)
export const getAppletCollabApi = createAppletCollabApi

type CollabErrorBoundaryProps = { children: ReactNode }
type CollabErrorBoundaryState = { error: boolean }
class CollabErrorBoundary extends Component<CollabErrorBoundaryProps, CollabErrorBoundaryState> {
  state: CollabErrorBoundaryState = { error: false }
  static getDerivedStateFromError(): CollabErrorBoundaryState {
    return { error: true }
  }
  render() {
    return this.state.error ? (
      <p role="alert" className="p-4 text-sm text-destructive">
        Collaboration could not load. Refresh this page to try again.
      </p>
    ) : (
      this.props.children
    )
  }
}

export type CollabGateProps = {
  workspaceId: string
  enabled: boolean
  children: ReactNode
}
export function CollabGate({ workspaceId, enabled, children }: CollabGateProps) {
  return (
    <CollabErrorBoundary key={workspaceId}>
      <CollabWorkspaceProvider key={workspaceId} workspaceId={workspaceId} enabled={enabled}>
        <EnabledContext value={enabled}>{children}</EnabledContext>
      </CollabWorkspaceProvider>
    </CollabErrorBoundary>
  )
}

const hasIdentity = () => getIdentity() != null

// Identity controls personal navigation and host UI independently of storage.
export function useCollabIdentityEnabled(): boolean {
  const enabled = useContext(EnabledContext)
  const identity = useSyncExternalStore(subscribeIdentityStore, hasIdentity, hasIdentity)
  return enabled && identity
}

export type AppletCollabMountProps = {
  workspaceId: string
  applet: { kind: AppletKind; name: string }
  active?: boolean
  children: ReactNode
}
export function AppletCollabMount(props: AppletCollabMountProps) {
  const enabled = useContext(EnabledContext)
  return <AppletCollabProvider {...props} active={enabled && props.active !== false} />
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
