import type { CollabIdentity, CollabLocation, CollabParticipant } from '@/lib/collab/types'

export type UserStatus = 'active' | 'away' | 'offline'
export type CollabUser = CollabIdentity & { status: UserStatus }
export type WorkspaceUsersOptions = { status?: UserStatus }
export type UsersSource = {
  participants: readonly CollabParticipant[]
  users: readonly CollabIdentity[]
}

export function userStatus(participants: readonly CollabParticipant[], id: string): UserStatus {
  const connections = participants.filter(participant => participant.userId === id)
  return connections.some(connection => connection.location !== null)
    ? 'active'
    : connections.length
      ? 'away'
      : 'offline'
}

// A supplied host directory is authoritative, including an empty list/removals.
export function workspaceProfiles(
  liveUsers: readonly CollabIdentity[],
  self: CollabIdentity | null,
  directory: readonly CollabIdentity[] | null
): readonly CollabIdentity[] {
  if (directory !== null) return directory
  const users = new Map(liveUsers.map(user => [user.id, user]))
  if (self) users.set(self.id, self)
  return [...users.values()]
}

export function resolveUser(source: UsersSource, id: string): CollabUser | null {
  const profile = source.users.find(user => user.id === id)
  return profile ? { ...profile, status: userStatus(source.participants, id) } : null
}

export type PeersOptions = { scope?: 'page' | 'workspace'; status?: 'active' | 'away' }
export function resolvePeers(
  source: UsersSource,
  selfId: string | null,
  location: CollabLocation | null,
  { scope = 'page', status }: PeersOptions = {}
): CollabUser[] {
  const peers: CollabUser[] = []
  const ids = new Set(
    source.participants
      .filter(
        participant =>
          participant.userId !== selfId &&
          (scope === 'workspace' ||
            (location !== null && participant.location?.page === location.page))
      )
      .map(participant => participant.userId)
  )
  for (const id of ids) {
    const user = resolveUser(source, id)
    if (user && (!status || user.status === status)) peers.push(user)
  }
  return peers
}

export type PresentPerson = {
  identity: CollabIdentity
  self: boolean
  pages: string[]
  status: UserStatus
}
export type SelfConnection = {
  identity: CollabIdentity | null
  connectionId: string | null
  page: string | null
  users: readonly CollabIdentity[]
}
export function groupPeople(
  participants: CollabParticipant[],
  self: SelfConnection
): PresentPerson[] {
  const users = [...self.users].sort(
    (a, b) => Number(b.id === self.identity?.id) - Number(a.id === self.identity?.id)
  )
  return users.map(identity => {
    const pages = new Set<string>()
    for (const participant of participants) {
      if (participant.userId !== identity.id || participant.connectionId === self.connectionId)
        continue
      if (participant.location) pages.add(participant.location.page)
    }
    const isSelf = identity.id === self.identity?.id
    if (isSelf && self.page) pages.add(self.page)
    return {
      identity,
      self: isSelf,
      pages: [...pages],
      status: userStatus(participants, identity.id)
    }
  })
}
