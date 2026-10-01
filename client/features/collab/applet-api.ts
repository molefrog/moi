import type * as CollabApi from 'moi/collab'
import { Activity } from './components/activity'
import { AvatarGroup } from './components/avatar-group'
import { User } from './components/user'
import { UserAvatar } from './components/user-avatar'
import { Cursors } from './components/cursors'
import { FocusFrame } from './components/focus-frame'
import { PresenceGroup } from './components/presence-group'
import { FocusAvatars } from './components/focus-avatars'
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
  AvatarGroup,
  User,
  UserAvatar,
  FocusFrame,
  PresenceGroup,
  FocusAvatars,
  Selection,
  useMe,
  usePeers,
  useUser,
  useWorkspaceUsers,
  usePresence,
  usePublishPresence
} satisfies AppletCollabApi
