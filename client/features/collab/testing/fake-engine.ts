import type { UserProfile, Connection, PresenceRegistration } from '@/lib/collab/types'
import { COLLAB_PROTOCOL_VERSION } from '@/lib/collab/protocol'
import type { CollabEngineApi } from '../client'
import { normalizeWorkspaceUsers } from '../host-state'
import type { WorkspaceDirectory } from '../host-state'
import { CollabStore } from '../store'

export type FakeEngineOptions = {
  self: UserProfile | undefined
  page?: string
  otherConnections?: Connection[]
  // Full fixture directory, including users who are offline.
  users?: readonly UserProfile[]
  directoryStatus?: WorkspaceDirectory['status']
}
export type FakeEngine = CollabEngineApi & {
  setOtherConnections: (otherConnections: Connection[]) => void
  setUsers: (users: readonly UserProfile[] | undefined) => void
  setDirectoryStatus: (status: WorkspaceDirectory['status'] | undefined) => void
}

export function createFakeEngine({
  self,
  page = 'preview',
  otherConnections = [],
  users,
  directoryStatus = users === undefined ? undefined : 'ready'
}: FakeEngineOptions): FakeEngine {
  const store = new CollabStore()
  const presence = new Map<string, PresenceRegistration>()
  const userListeners = new Set<() => void>()
  const directory = users === undefined ? undefined : normalizeWorkspaceUsers(users)
  let profiles = directory ?? (self ? [self] : [])
  let directorySnapshot: WorkspaceDirectory | undefined =
    directoryStatus === 'ready'
      ? { status: directoryStatus, users: directory ?? [] }
      : directoryStatus === 'loading'
        ? { status: directoryStatus }
        : undefined
  let currentOtherConnections = otherConnections
  let location: Connection['location'] = { page, status: 'active' }
  const connections = (): Connection[] => [
    ...(self
      ? [{ connectionId: 'local', userId: self.id, location, presence: [...presence.values()] }]
      : []),
    ...currentOtherConnections
  ]
  const liveUsers = () => {
    const connected = new Set(connections().map(connection => connection.userId))
    return profiles.filter(user => connected.has(user.id))
  }
  const announce = () =>
    store.receive({ type: 'connections', connections: connections(), users: liveUsers() })
  store.setSender(message => {
    switch (message.type) {
      case 'location':
        location = message.location
        announce()
        break
      case 'presence:set': {
        const { type: _type, ...registration } = message
        presence.set(registration.registrationId, registration)
        announce()
        break
      }
      case 'presence:delete':
        presence.delete(message.registrationId)
        announce()
        break
      default:
        break
    }
  })
  store.setLocation(location)
  store.receive({
    type: 'welcome',
    version: COLLAB_PROTOCOL_VERSION,
    connectionId: 'local',
    connections: connections(),
    users: liveUsers()
  })
  return {
    workspaceId: 'preview',
    enabled: true,
    start: () => () => {},
    getSnapshot: store.getSnapshot,
    getUsersSnapshot: store.getUsersSnapshot,
    getPresenceSnapshot: store.getPresenceSnapshot,
    subscribe: store.subscribe,
    getCurrentUser: () => self,
    subscribeCurrentUser: () => () => {},
    getWorkspaceDirectory: () => directorySnapshot,
    subscribeWorkspaceUsers: listener => {
      userListeners.add(listener)
      return () => {
        userListeners.delete(listener)
      }
    },
    getLocation: () => store.getLocation(),
    setLocation: location => store.setLocation(location),
    setPresence: registration => {
      if (self) store.setPresence(registration)
    },
    deletePresence: registrationId => {
      if (self) store.deletePresence(registrationId)
    },
    setOtherConnections: next => {
      currentOtherConnections = next
      announce()
    },
    setUsers: next => {
      const directory = next === undefined ? undefined : normalizeWorkspaceUsers(next)
      directorySnapshot =
        directory === undefined ? undefined : { status: 'ready', users: directory }
      if (directory) profiles = directory
      userListeners.forEach(listener => listener())
      announce()
    },
    setDirectoryStatus: status => {
      directorySnapshot =
        status === 'ready'
          ? { status, users: profiles }
          : status === 'loading'
            ? { status }
            : undefined
      userListeners.forEach(listener => listener())
    }
  }
}
