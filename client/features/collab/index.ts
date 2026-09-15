import { Activity, Cursors, PresenceField, Selection, SyncStatus } from './components'
import { useOthers, usePresence, useSelf, useSharedState, useSharedStore } from './hooks'

export { CollabWorkspaceProvider, AppletCollabProvider } from './hooks'
export { WorkspaceCollabControls } from './WorkspaceCollabControls'
export { getIdentity, subscribeIdentityStore } from './identity'

const appletApi = {
  Activity,
  Cursors,
  PresenceField,
  Selection,
  SyncStatus,
  useOthers,
  usePresence,
  useSelf,
  useSharedState,
  useSharedStore
}

export function createAppletCollabApi() {
  return appletApi
}
