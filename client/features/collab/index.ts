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
import { useMe, usePeers, usePresence, usePublishPresence, useUser } from './hooks'

export { CollabWorkspaceProvider, AppletCollabProvider, CollabBackendProvider } from './hooks'
export { WorkspaceCollabControls } from './WorkspaceCollabControls'
export { getIdentity, subscribeIdentityStore } from './identity'

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
  usePresence,
  usePublishPresence
}

export function createAppletCollabApi() {
  return appletApi
}
