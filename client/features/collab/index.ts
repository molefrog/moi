import {
  Activity,
  Cursor,
  Cursors,
  Facepile,
  Person,
  PresenceField,
  PresenceFrame,
  PresenceGutter,
  Selection
} from './components'
import { useOthers, usePerson, usePresence, useSelf, useSharedState, useSharedStore } from './hooks'

export { CollabWorkspaceProvider, AppletCollabProvider, CollabBackendProvider } from './hooks'
export { WorkspaceCollabControls } from './WorkspaceCollabControls'
export { getIdentity, subscribeIdentityStore } from './identity'

const appletApi = {
  Activity,
  Cursor,
  Cursors,
  Facepile,
  Person,
  PresenceField,
  PresenceFrame,
  PresenceGutter,
  Selection,
  useOthers,
  usePerson,
  usePresence,
  useSelf,
  useSharedState,
  useSharedStore
}

export function createAppletCollabApi() {
  return appletApi
}
