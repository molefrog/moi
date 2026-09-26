import type { CollabIdentity, CollabLocation, CollabPresenceRegistration } from '@/lib/collab/types'

import type { CollabClient } from './client'
import {
  getIdentity,
  getWorkspaceUsers,
  subscribeIdentityStore,
  subscribeWorkspaceUsersStore
} from './identity'
import { DISCONNECTED_STATE } from './store'
import type { CollabConnectionState } from './store'

type Unsubscribe = () => void

// The same presence contract drives the live workspace and the dev playground.
export type CollabBackend = {
  getSnapshot: () => CollabConnectionState
  subscribe: (listener: () => void) => Unsubscribe
  getIdentity: () => CollabIdentity | null
  subscribeIdentity: (listener: () => void) => Unsubscribe
  getWorkspaceUsers: () => readonly CollabIdentity[] | null
  subscribeWorkspaceUsers: (listener: () => void) => Unsubscribe
  getLocation: () => CollabLocation | null
  setPresence: (registration: CollabPresenceRegistration) => void
  deletePresence: (registrationId: string) => void
}

export const NO_BACKEND_STATE = DISCONNECTED_STATE
const noop = () => {}
export const NO_BACKEND: CollabBackend = {
  getSnapshot: () => NO_BACKEND_STATE,
  subscribe: () => noop,
  getIdentity,
  subscribeIdentity: subscribeIdentityStore,
  getWorkspaceUsers: () => null,
  subscribeWorkspaceUsers: () => noop,
  getLocation: () => null,
  setPresence: noop,
  deletePresence: noop
}

export function createLiveBackend(client: CollabClient, enabled = true): CollabBackend {
  const { store, workspaceId } = client
  return {
    ...(enabled
      ? {
          getSnapshot: store.getSnapshot,
          subscribe: store.subscribe,
          getLocation: () => store.getLocation(),
          setPresence: (registration: CollabPresenceRegistration) =>
            store.setPresence(registration),
          deletePresence: (registrationId: string) => store.deletePresence(registrationId)
        }
      : NO_BACKEND),
    getIdentity,
    subscribeIdentity: subscribeIdentityStore,
    getWorkspaceUsers: () => getWorkspaceUsers(workspaceId),
    subscribeWorkspaceUsers: listener => subscribeWorkspaceUsersStore(workspaceId, listener)
  }
}
