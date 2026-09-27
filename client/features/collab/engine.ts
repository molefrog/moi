import type { CollabIdentity, CollabLocation, CollabPresenceRegistration } from '@/lib/collab/types'

import { CollabClient } from './client'
import {
  getIdentity,
  getWorkspaceDirectory,
  getWorkspaceUsers,
  subscribeIdentityStore,
  subscribeWorkspaceUsersStore
} from './identity'
import type { WorkspaceDirectory } from './identity'
import { DISCONNECTED_STATE } from './store'
import type { CollabConnectionState, CollabPresenceEntry } from './store'

type Unsubscribe = () => void

// A workspace exposes one engine to React. The playground implements this same
// contract; sockets, timers, and registration storage stay behind it.
export type CollabEngineApi = {
  readonly workspaceId: string
  readonly enabled: boolean
  start: () => Unsubscribe
  getSnapshot: () => CollabConnectionState
  getPeopleSnapshot: () => CollabConnectionState
  getPresenceSnapshot: (surface: string, channel: string) => readonly CollabPresenceEntry[]
  subscribe: (listener: () => void) => Unsubscribe
  getIdentity: () => CollabIdentity | null
  subscribeIdentity: (listener: () => void) => Unsubscribe
  getWorkspaceUsers: () => readonly CollabIdentity[] | null
  getWorkspaceDirectory: () => WorkspaceDirectory
  subscribeWorkspaceUsers: (listener: () => void) => Unsubscribe
  getLocation: () => CollabLocation | null
  setLocation: (location: CollabLocation | null) => void
  setPresence: (registration: CollabPresenceRegistration) => void
  deletePresence: (registrationId: string) => void
}

const noop = () => {}
const EMPTY_PRESENCE: readonly CollabPresenceEntry[] = []
const UNAVAILABLE_DIRECTORY: WorkspaceDirectory = { status: 'unavailable', users: [] }

export const NO_ENGINE: CollabEngineApi = {
  workspaceId: '',
  enabled: false,
  start: () => noop,
  getSnapshot: () => DISCONNECTED_STATE,
  getPeopleSnapshot: () => DISCONNECTED_STATE,
  getPresenceSnapshot: () => EMPTY_PRESENCE,
  subscribe: () => noop,
  getIdentity,
  subscribeIdentity: subscribeIdentityStore,
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
  getSnapshot = (): CollabConnectionState =>
    this.enabled ? this.client.store.getSnapshot() : DISCONNECTED_STATE
  getPeopleSnapshot = (): CollabConnectionState =>
    this.enabled ? this.client.store.getPeopleSnapshot() : DISCONNECTED_STATE
  getPresenceSnapshot = (surface: string, channel: string): readonly CollabPresenceEntry[] =>
    this.enabled ? this.client.store.getPresenceSnapshot(surface, channel) : EMPTY_PRESENCE
  subscribe = (listener: () => void): Unsubscribe =>
    this.enabled ? this.client.store.subscribe(listener) : noop
  getIdentity = getIdentity
  subscribeIdentity = subscribeIdentityStore
  getWorkspaceUsers = (): readonly CollabIdentity[] | null => getWorkspaceUsers(this.workspaceId)
  getWorkspaceDirectory = (): WorkspaceDirectory => getWorkspaceDirectory(this.workspaceId)
  subscribeWorkspaceUsers = (listener: () => void): Unsubscribe =>
    subscribeWorkspaceUsersStore(this.workspaceId, listener)
  getLocation = (): CollabLocation | null => (this.enabled ? this.client.store.getLocation() : null)
  setLocation = (location: CollabLocation | null): void => {
    this.client.store.setLocation(location)
  }
  setPresence = (registration: CollabPresenceRegistration): void => {
    if (this.enabled) this.client.store.setPresence(registration)
  }
  deletePresence = (registrationId: string): void => {
    if (this.enabled) this.client.store.deletePresence(registrationId)
  }
}
