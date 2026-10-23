import type * as CollabApi from 'moi/collab'
import { UserAvatarGroupContainer } from './components/user-avatar-group'
import { UserContainer } from './components/user'
import { UserAvatarContainer } from './components/user-avatar'
import { CursorsContainer } from './components/cursors'
import { PresenceFrameContainer } from './components/presence-frame'
import { PresenceGroupContainer } from './components/presence-group'
import { PresenceAvatarsContainer } from './components/presence-avatars'
import {
  useMe,
  usePeers,
  usePresence,
  usePublishPresence,
  useUser,
  useWorkspaceUsers
} from './hooks'

export type AppletCollabApi = typeof CollabApi

// SDK components resolve collaboration data; host UI can import the plain components.
export const appletCollabApi = {
  Cursors: CursorsContainer,
  User: UserContainer,
  UserAvatar: UserAvatarContainer,
  UserAvatarGroup: UserAvatarGroupContainer,
  PresenceFrame: PresenceFrameContainer,
  PresenceAvatars: PresenceAvatarsContainer,
  PresenceGroup: PresenceGroupContainer,
  useMe,
  usePeers,
  useUser,
  useWorkspaceUsers,
  usePresence,
  usePublishPresence
} satisfies AppletCollabApi
