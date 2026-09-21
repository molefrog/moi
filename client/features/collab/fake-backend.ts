import type {
  CollabClientMessage,
  CollabIdentity,
  CollabJsonValue,
  CollabOperation,
  CollabParticipant,
  CollabPresenceRegistration
} from '@/lib/collab/types'

import type { CollabBackend } from './backend'
import { CollabStore } from './store'

export type FakeBackendOptions = {
  // The person looking at the page. Null behaves like a tab without a profile.
  self: CollabIdentity | null
  page?: string
  others?: CollabParticipant[]
  // People who have been here before and are not connected now.
  people?: CollabIdentity[]
  // Starting shared data by scope.
  entries?: Record<string, Record<string, CollabJsonValue>>
  // How long a save takes, so saving states are visible.
  latency?: number
}

export type FakeCollabBackend = CollabBackend & {
  // Replace everyone else in the room: who is here, where, with what presence.
  setOthers: (others: CollabParticipant[]) => void
  // Commit a change as if someone else had made it.
  write: (scope: string, operations: CollabOperation[]) => void
}

type Room = { entries: Record<string, CollabJsonValue>; revision: number }

// An in-memory room behind the real connection store, for dev pages and tests.
// The store keeps its optimistic writes, validation, and error handling; only
// the server on the other end of the wire is made up.
export function createFakeBackend({
  self,
  page = 'preview',
  others = [],
  people = [],
  entries = {},
  latency = 0
}: FakeBackendOptions): FakeCollabBackend {
  const store = new CollabStore()
  const rooms = new Map<string, Room>()
  const subscriptions = new Map<string, string>()
  const presence = new Map<string, CollabPresenceRegistration>()
  let everyoneElse = others
  let location: CollabParticipant['location'] = { page }

  const room = (scope: string): Room => {
    let found = rooms.get(scope)
    if (!found) {
      found = { entries: { ...entries[scope] }, revision: 0 }
      rooms.set(scope, found)
    }
    return found
  }
  const participants = (): CollabParticipant[] => [
    ...(self
      ? [{ connectionId: 'local', identity: self, location, presence: [...presence.values()] }]
      : []),
    ...everyoneElse
  ]
  const announce = () => store.receive({ type: 'participants', participants: participants() })
  const commit = (scope: string, operations: CollabOperation[], operationId: string) => {
    const target = room(scope)
    for (const operation of operations) {
      if (operation.type === 'delete') delete target.entries[operation.key]
      else target.entries[operation.key] = operation.value
    }
    target.revision++
    const subscriptionId = subscriptions.get(scope)
    if (subscriptionId)
      store.receive({
        type: 'update',
        scope,
        revision: target.revision,
        operations,
        operationId,
        subscriptionId
      })
  }
  const later = (run: () => void) => {
    if (latency > 0) setTimeout(run, latency)
    else run()
  }

  store.setSender((message: CollabClientMessage) => {
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
      case 'subscribe': {
        subscriptions.set(message.scope, message.subscriptionId)
        const { entries: current, revision } = room(message.scope)
        later(() =>
          store.receive({
            type: 'snapshot',
            scope: message.scope,
            subscriptionId: message.subscriptionId,
            entries: { ...current },
            revision
          })
        )
        break
      }
      case 'unsubscribe':
        subscriptions.delete(message.scope)
        break
      case 'mutate':
        later(() => commit(message.scope, message.operations, message.operationId))
        break
      default:
        break
    }
  })
  store.setLocation(location)
  store.receive({
    type: 'welcome',
    version: 1,
    connectionId: 'local',
    identity: self,
    participants: participants(),
    people
  })

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    getIdentity: () => self,
    subscribeIdentity: () => () => {},
    getLocation: () => store.getLocation(),
    setPresence: registration => store.setPresence(registration),
    deletePresence: registrationId => store.deletePresence(registrationId),
    acquireScope: scope => store.acquireScope(scope),
    getScopeSnapshot: scope => store.getScopeSnapshot(scope),
    subscribeScope: (scope, listener) => store.subscribeScope(scope, listener),
    mutate: (scope, operations) => store.mutate(scope, operations),
    setOthers: next => {
      everyoneElse = next
      announce()
    },
    write: (scope, operations) => commit(scope, operations, crypto.randomUUID())
  }
}
