import {
  Activity,
  Cursors,
  Facepile,
  User,
  PresenceFrame,
  PresenceGroup,
  PresenceGutter,
  Selection
} from './components'
import {
  useMe,
  usePeers,
  usePresence,
  usePublishPresence,
  useUser,
  useWorkspaceUsers,
  useWorkspaceUsersAvailability
} from './hooks'

export { CollabProvider, AppletScope, CollabContext } from './hooks'
export { WorkspaceCollabControls } from './WorkspaceCollabControls'
export { getCurrentUser, subscribeCurrentUserStore } from './host-state'

const appletApi = {
  Activity,
  Cursors,
  Facepile,
  User,
  PresenceFrame,
  PresenceGroup,
  PresenceGutter,
  Selection,
  useMe,
  usePeers,
  useUser,
  useWorkspaceUsers,
  useWorkspaceUsersAvailability,
  usePresence,
  usePublishPresence
}

export type AppletCollabApi = typeof appletApi

export function createAppletCollabApi() {
  return appletApi
}
