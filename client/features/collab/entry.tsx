// The ordinary app imports only this small boundary. Collaboration code and its
// transport load only when the server runtime is enabled.
import { Component, Suspense, createContext, lazy, useContext, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { Icon as TabIcon } from '@tabler/icons-react'
import type { AppletKind, WorkspaceTabId } from '@/lib/types'
import type * as CollabModuleNamespace from './index'

type CollabModule = typeof CollabModuleNamespace
let loaded: CollabModule | undefined
const EnabledContext = createContext(false)
const LazyWorkspace = lazy(async () => {
  loaded = await import('./index')
  return { default: loaded.CollabWorkspaceProvider }
})

export function getAppletCollabApi():
  | ReturnType<CollabModule['createAppletCollabApi']>
  | undefined {
  return loaded?.createAppletCollabApi()
}

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
  if (!enabled) return <EnabledContext value={false}>{children}</EnabledContext>
  return (
    <CollabErrorBoundary key={workspaceId}>
      <Suspense
        fallback={
          <p role="status" className="p-4 text-sm text-muted-foreground">
            Loading collaboration…
          </p>
        }
      >
        <LazyWorkspace key={workspaceId} workspaceId={workspaceId}>
          <EnabledContext value>{children}</EnabledContext>
        </LazyWorkspace>
      </Suspense>
    </CollabErrorBoundary>
  )
}

const subscribeIdentity = (listener: () => void) =>
  loaded?.subscribeIdentityStore(listener) ?? (() => {})
const hasIdentity = () => loaded?.getIdentity() != null

// Identity controls personal navigation and host UI independently of storage.
export function useCollabIdentityEnabled(): boolean {
  const enabled = useContext(EnabledContext)
  const identity = useSyncExternalStore(subscribeIdentity, hasIdentity, hasIdentity)
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
  if (!loaded || !enabled) return props.children
  return <loaded.AppletCollabProvider {...props} />
}

export type CollabTabInfo = { label: string; Icon: TabIcon }
export type CollabControlsProps = {
  workspaceId: string
  // Resolves a participant's tab to the label and icon the tab strip uses.
  describeTab: (tab: WorkspaceTabId) => CollabTabInfo | null
  onOpenTab: (tab: WorkspaceTabId) => void
}
export function CollabControls(props: CollabControlsProps) {
  const enabled = useCollabIdentityEnabled()
  return loaded && enabled ? <loaded.WorkspaceCollabControls {...props} /> : null
}
