import type * as CollabApi from 'moi/collab'
import { UserAvatarGroup } from './components/user-avatar-group'
import { User } from './components/user'
import { UserAvatar } from './components/user-avatar'
import { Cursors } from './components/cursors'
import { PresenceFrame } from './components/presence-frame'
import { PresenceGroup } from './components/presence-group'
import { PresenceAvatars } from './components/presence-avatars'
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
  Cursors,
  UserAvatarGroup,
  User,
  UserAvatar,
  PresenceFrame,
  PresenceGroup,
  PresenceAvatars,
  useMe,
  usePeers,
  useUser,
  useWorkspaceUsers,
  usePresence,
  usePublishPresence
} satisfies AppletCollabApi
