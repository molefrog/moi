import type { UserProfile, ConnectionLocation, Connection } from '@/lib/collab/types'

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

export function userStatus(connections: readonly Connection[], id: string): UserStatus {
  const userConnections = connections.filter(connection => connection.userId === id)
  return userConnections.some(connection => connection.location?.status === 'active')
    ? 'active'
    : userConnections.length
      ? 'away'
      : 'offline'
}

export function resolveUser(source: UsersSource, id: string): WorkspaceUser | undefined {
  const profile = source.users.find(user => user.id === id)
  return profile ? { ...profile, status: userStatus(source.connections, id) } : undefined
}

export function resolvePeers(
  source: UsersSource,
  selfId: string | undefined,
  location: ConnectionLocation | null,
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
  page: string | undefined
  status: UserStatus
}
export type CurrentUserContext = {
  currentUser: UserProfile | undefined
  page: string | null
  users: readonly UserProfile[]
}
export function summarizeWorkspaceUsers(
  connections: Connection[],
  context: CurrentUserContext
): WorkspaceUserInfo[] {
  return context.users
    .map(profile => {
      const isSelf = profile.id === context.currentUser?.id
      const activeConnection = connections.find(
        connection => connection.userId === profile.id && connection.location?.status === 'active'
      )
      return {
        profile,
        self: isSelf,
        page: isSelf ? (context.page ?? undefined) : activeConnection?.location?.page,
        status: userStatus(connections, profile.id)
      }
    })
    .toSorted(
      (a, b) =>
        Number(b.self) - Number(a.self) ||
        Number(b.status === 'active') - Number(a.status === 'active')
    )
}
