import type {
  CollabIdentity,
  CollabLocation,
  CollabOperation,
  CollabPresenceRegistration
} from '@/lib/collab/types'

import type { CollabClient } from './client'
import { getIdentity, subscribeIdentityStore } from './identity'
import type { CollabConnectionState, MutationOutcome, SharedScopeState } from './store'

type Unsubscribe = () => void

// Everything the collab hooks and components need from a sync engine, and
// nothing about how it talks to one. The workspace provides the live backend
// below; dev pages and tests provide the in-memory one from fake-backend.ts.
// A different engine only has to fill in this shape.
export type CollabBackend = {
  // Connection status, live participants, and the people directory.
  getSnapshot: () => CollabConnectionState
  subscribe: (listener: () => void) => Unsubscribe
  // Who is looking. Null while no identity is set: shared state still works,
  // presence does not.
  getIdentity: () => CollabIdentity | null
  subscribeIdentity: (listener: () => void) => Unsubscribe
  getLocation: () => CollabLocation | null
  // Temporary presence, one registration per mounted hook.
  setPresence: (registration: CollabPresenceRegistration) => void
  deletePresence: (registrationId: string) => void
  // Shared state. A scope stays subscribed while anything holds it.
  acquireScope: (scope: string) => Unsubscribe
  getScopeSnapshot: (scope: string) => SharedScopeState
  subscribeScope: (scope: string, listener: () => void) => Unsubscribe
  mutate: (scope: string, operations: CollabOperation[]) => Promise<MutationOutcome>
}

export const NO_BACKEND_STATE: CollabConnectionState = {
  status: 'disconnected',
  connectionId: null,
  participants: [],
  people: {},
  pendingCount: 0,
  error: null
}

// The workspace connection: a WebSocket client around the connection store.
export function createLiveBackend(client: CollabClient): CollabBackend {
  const { store } = client
  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    getIdentity,
    subscribeIdentity: subscribeIdentityStore,
    getLocation: () => store.getLocation(),
    setPresence: registration => store.setPresence(registration),
    deletePresence: registrationId => store.deletePresence(registrationId),
    acquireScope: scope => {
      const release = store.acquireScope(scope)
      // Anonymous tabs only hold a connection while they use shared state.
      const releaseConnection = client.acquireSharedState()
      return () => {
        release()
        releaseConnection()
      }
    },
    getScopeSnapshot: scope => store.getScopeSnapshot(scope),
    subscribeScope: (scope, listener) => store.subscribeScope(scope, listener),
    mutate: (scope, operations) => store.mutate(scope, operations)
  }
}
