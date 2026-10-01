import type * as CollabApi from 'moi/collab'
import { Activity } from './components/activity'
import { Facepile } from './components/facepile'
import { User } from './components/user'
import { Cursors } from './components/cursors'
import { PresenceFrame } from './components/presence-frame'
import { PresenceGroup } from './components/presence-group'
import { PresenceGutter } from './components/presence-gutter'
import { Selection } from './components/selection'
import {
  useMe,
  usePeers,
  usePresence,
  usePublishPresence,
  useUser,
  useWorkspaceUsers
} from './hooks'

export type AppletCollabApi = typeof CollabApi

export const appletCollabApi = {
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
  usePresence,
  usePublishPresence
} satisfies AppletCollabApi
