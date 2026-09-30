import type { UserProfile, CollabLocation, Connection } from '@/lib/collab/types'

import type { UserStatus, WorkspaceUser, UsePeersOptions } from 'moi/collab'

export type {
  UserStatus,
  WorkspaceUser,
  UsePeersOptions,
  UseWorkspaceUsersOptions
} from 'moi/collab'
export type UsersSource = {
  connections: readonly Connection[]
  users: readonly UserProfile[]
}

// Presentation only: keep the supplied profile unchanged in applet APIs.
export function userDisplayName(user: UserProfile): string {
  return user.name?.trim() || user.email?.trim() || user.id
}

export function userStatus(connections: readonly Connection[], id: string): UserStatus {
  const userConnections = connections.filter(connection => connection.userId === id)
  return userConnections.some(
    connection => connection.location !== null && !connection.location.away
  )
    ? 'active'
    : userConnections.length
      ? 'away'
      : 'offline'
}

// A supplied host directory is authoritative, including an empty list/removals.
export function workspaceProfiles(
  liveUsers: readonly UserProfile[],
  self: UserProfile | undefined,
  directory: readonly UserProfile[] | null
): readonly UserProfile[] {
  if (directory !== null) return directory
  const users = new Map(liveUsers.map(user => [user.id, user]))
  if (self) users.set(self.id, self)
  return [...users.values()]
}

export function resolveUser(source: UsersSource, id: string): WorkspaceUser | undefined {
  const profile = source.users.find(user => user.id === id)
  return profile ? { ...profile, status: userStatus(source.connections, id) } : undefined
}

export function resolvePeers(
  source: UsersSource,
  selfId: string | undefined,
  location: CollabLocation | null,
  { scope = 'page', status }: UsePeersOptions = {}
): WorkspaceUser[] {
  const peers: WorkspaceUser[] = []
  const ids = new Set(
    source.connections
      .filter(
        connection =>
          connection.userId !== selfId &&
          (scope === 'workspace' ||
            (location !== null && connection.location?.page === location.page))
      )
      .map(connection => connection.userId)
  )
  for (const id of ids) {
    const user = resolveUser(source, id)
    if (user && (!status || user.status === status)) peers.push(user)
  }
  return peers
}

export type WorkspaceUserInfo = {
  profile: UserProfile
  self: boolean
  pages: string[]
  status: UserStatus
}
export type CurrentUserContext = {
  currentUser: UserProfile | undefined
  connectionId: string | null
  page: string | null
  users: readonly UserProfile[]
}
export function summarizeWorkspaceUsers(
  connections: Connection[],
  context: CurrentUserContext
): WorkspaceUserInfo[] {
  const users = [...context.users].sort(
    (a, b) => Number(b.id === context.currentUser?.id) - Number(a.id === context.currentUser?.id)
  )
  return users.map(profile => {
    const pages = new Set<string>()
    for (const connection of connections) {
      if (connection.userId !== profile.id || connection.connectionId === context.connectionId)
        continue
      if (connection.location) pages.add(connection.location.page)
    }
    const isSelf = profile.id === context.currentUser?.id
    if (isSelf && context.page) pages.add(context.page)
    return {
      profile,
      self: isSelf,
      pages: [...pages],
      status: userStatus(connections, profile.id)
    }
  })
}
