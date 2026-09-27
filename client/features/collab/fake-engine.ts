import type {
  CollabIdentity,
  CollabParticipant,
  CollabPresenceRegistration
} from '@/lib/collab/types'
import type { CollabEngineApi } from './engine'
import { normalizeWorkspaceUsers } from './identity'
import type { WorkspaceDirectory } from './identity'
import { CollabStore } from './store'

export type FakeEngineOptions = {
  self: CollabIdentity | null
  page?: string
  others?: CollabParticipant[]
  // Full fixture directory, including users who are offline.
  users?: readonly CollabIdentity[]
  directoryStatus?: WorkspaceDirectory['status']
}
export type FakeCollabEngine = CollabEngineApi & {
  setOthers: (others: CollabParticipant[]) => void
  setUsers: (users: readonly CollabIdentity[] | null) => void
  setDirectoryStatus: (status: WorkspaceDirectory['status']) => void
}

export function createFakeEngine({
  self,
  page = 'preview',
  others = [],
  users,
  directoryStatus = users === undefined ? 'unavailable' : 'ready'
}: FakeEngineOptions): FakeCollabEngine {
  const store = new CollabStore()
  const presence = new Map<string, CollabPresenceRegistration>()
  const userListeners = new Set<() => void>()
  let directory = users === undefined ? null : normalizeWorkspaceUsers(users)
  let profiles = directory ?? (self ? [self] : [])
  let directorySnapshot: WorkspaceDirectory = {
    status: directoryStatus,
    users: directoryStatus === 'ready' ? (directory ?? []) : []
  }
  directory = directoryStatus === 'unavailable' ? null : directorySnapshot.users
  let everyoneElse = others
  let location: CollabParticipant['location'] = { page }
  const participants = (): CollabParticipant[] => [
    ...(self
      ? [{ connectionId: 'local', userId: self.id, location, presence: [...presence.values()] }]
      : []),
    ...everyoneElse
  ]
  const liveUsers = () => {
    const connected = new Set(participants().map(participant => participant.userId))
    return profiles.filter(user => connected.has(user.id))
  }
  const announce = () =>
    store.receive({ type: 'participants', participants: participants(), users: liveUsers() })
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
    version: 2,
    connectionId: 'local',
    participants: participants(),
    users: liveUsers()
  })
  return {
    workspaceId: 'preview',
    enabled: true,
    start: () => () => {},
    getSnapshot: store.getSnapshot,
    getPeopleSnapshot: store.getPeopleSnapshot,
    getPresenceSnapshot: store.getPresenceSnapshot,
    subscribe: store.subscribe,
    getIdentity: () => self,
    subscribeIdentity: () => () => {},
    getWorkspaceUsers: () => directory,
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
    setOthers: next => {
      everyoneElse = next
      announce()
    },
    setUsers: next => {
      directory = next === null ? null : normalizeWorkspaceUsers(next)
      directorySnapshot = {
        status: next === null ? 'unavailable' : 'ready',
        users: directory ?? []
      }
      if (directory) profiles = directory
      userListeners.forEach(listener => listener())
      announce()
    },
    setDirectoryStatus: status => {
      directorySnapshot = { status, users: status === 'ready' ? profiles : [] }
      directory = status === 'unavailable' ? null : directorySnapshot.users
      userListeners.forEach(listener => listener())
    }
  }
}
