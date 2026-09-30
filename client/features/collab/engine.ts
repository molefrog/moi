import type { UserProfile, ConnectionLocation, PresenceRegistration } from '@/lib/collab/types'

import { CollabClient } from './client'
import {
  getCurrentUser,
  getWorkspaceDirectory,
  getWorkspaceUsers,
  subscribeCurrentUserStore,
  subscribeWorkspaceUsersStore
} from './host-state'
import type { WorkspaceDirectory } from './host-state'
import { DISCONNECTED_STATE } from './store'
import type { ClientState, PresenceEntry } from './store'

type Unsubscribe = () => void

// A workspace exposes one engine to React. The playground implements this same
// contract; sockets, timers, and registration storage stay behind it.
export type CollabEngineApi = {
  readonly workspaceId: string
  readonly enabled: boolean
  start: () => Unsubscribe
  getSnapshot: () => ClientState
  getUsersSnapshot: () => ClientState
  getPresenceSnapshot: (appletId: string, channel: string) => readonly PresenceEntry[]
  subscribe: (listener: () => void) => Unsubscribe
  getCurrentUser: () => UserProfile | undefined
  subscribeCurrentUser: (listener: () => void) => Unsubscribe
  getWorkspaceUsers: () => readonly UserProfile[] | null
  getWorkspaceDirectory: () => WorkspaceDirectory
  subscribeWorkspaceUsers: (listener: () => void) => Unsubscribe
  getLocation: () => ConnectionLocation | null
  setLocation: (location: ConnectionLocation | null) => void
  setPresence: (registration: PresenceRegistration) => void
  deletePresence: (registrationId: string) => void
}

const noop = () => {}
const EMPTY_PRESENCE: readonly PresenceEntry[] = []
const UNAVAILABLE_DIRECTORY: WorkspaceDirectory = { status: 'unavailable', users: [] }

export const NO_ENGINE: CollabEngineApi = {
  workspaceId: '',
  enabled: false,
  start: () => noop,
  getSnapshot: () => DISCONNECTED_STATE,
  getUsersSnapshot: () => DISCONNECTED_STATE,
  getPresenceSnapshot: () => EMPTY_PRESENCE,
  subscribe: () => noop,
  getCurrentUser,
  subscribeCurrentUser: subscribeCurrentUserStore,
  getWorkspaceUsers: () => null,
  getWorkspaceDirectory: () => UNAVAILABLE_DIRECTORY,
  subscribeWorkspaceUsers: () => noop,
  getLocation: () => null,
  setLocation: noop,
  setPresence: noop,
  deletePresence: noop
}

export class CollabEngine implements CollabEngineApi {
  private readonly client: CollabClient

  constructor(
    readonly workspaceId: string,
    readonly enabled = true
  ) {
    this.client = new CollabClient(workspaceId)
  }

  start = (): Unsubscribe => (this.enabled ? this.client.start() : noop)
  getSnapshot = (): ClientState =>
    this.enabled ? this.client.store.getSnapshot() : DISCONNECTED_STATE
  getUsersSnapshot = (): ClientState =>
    this.enabled ? this.client.store.getUsersSnapshot() : DISCONNECTED_STATE
  getPresenceSnapshot = (appletId: string, channel: string): readonly PresenceEntry[] =>
    this.enabled ? this.client.store.getPresenceSnapshot(appletId, channel) : EMPTY_PRESENCE
  subscribe = (listener: () => void): Unsubscribe =>
    this.enabled ? this.client.store.subscribe(listener) : noop
  getCurrentUser = getCurrentUser
  subscribeCurrentUser = subscribeCurrentUserStore
  getWorkspaceUsers = (): readonly UserProfile[] | null => getWorkspaceUsers(this.workspaceId)
  getWorkspaceDirectory = (): WorkspaceDirectory => getWorkspaceDirectory(this.workspaceId)
  subscribeWorkspaceUsers = (listener: () => void): Unsubscribe =>
    subscribeWorkspaceUsersStore(this.workspaceId, listener)
  getLocation = (): ConnectionLocation | null =>
    this.enabled ? this.client.store.getLocation() : null
  setLocation = (location: ConnectionLocation | null): void => {
    this.client.store.setLocation(location)
  }
  setPresence = (registration: PresenceRegistration): void => {
    if (this.enabled) this.client.store.setPresence(registration)
  }
  deletePresence = (registrationId: string): void => {
    if (this.enabled) this.client.store.deletePresence(registrationId)
  }
}
