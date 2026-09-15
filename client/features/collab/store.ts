import type {
  CollabClientMessage,
  CollabIdentity,
  CollabJsonValue,
  CollabLocation,
  CollabOperation,
  CollabParticipant,
  CollabPresenceRegistration,
  CollabServerMessage
} from '@/lib/collab/types'

export type MutationOutcome =
  | { status: 'committed'; revision: number }
  | { status: 'rejected' | 'unknown'; message: string }

export type CollabConnectionState = {
  status: 'connecting' | 'connected' | 'disconnected'
  connectionId: string | null
  participants: CollabParticipant[]
  pendingCount: number
  error: string | null
}

export type SharedScopeState = {
  entries: Readonly<Record<string, CollabJsonValue>>
  loaded: boolean
  synced: boolean
  revision: number
  isSaving: boolean
  error: string | null
}

type Scope = {
  confirmed: Record<string, CollabJsonValue>
  snapshot: SharedScopeState
  subscriptionId: string
  users: number
  listeners: Set<() => void>
}

type PendingMutation = {
  scope: string
  operations: CollabOperation[]
  uncertain: boolean
  acknowledgedRevision?: number
  resolve: (outcome: MutationOutcome) => void
}

function applyOperations(
  entries: Readonly<Record<string, CollabJsonValue>>,
  operations: CollabOperation[]
): Record<string, CollabJsonValue> {
  const next = { ...entries }
  for (const operation of operations) {
    if (operation.type === 'delete') delete next[operation.key]
    else
      Object.defineProperty(next, operation.key, {
        value: operation.value,
        enumerable: true,
        writable: true,
        configurable: true
      })
  }
  return next
}

function isJson(value: unknown): value is CollabJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJson)
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false
  return Object.values(value).every(isJson)
}

// Pure connection model: sockets and timers live in client.ts. Keeping server
// data separate from ordered optimistic layers prevents a rejected earlier save
// from rolling back a later edit.
export class CollabStore {
  private state: CollabConnectionState = {
    status: 'connecting',
    connectionId: null,
    participants: [],
    pendingCount: 0,
    error: null
  }
  private listeners = new Set<() => void>()
  private scopes = new Map<string, Scope>()
  private pending = new Map<string, PendingMutation>()
  private registrations = new Map<string, CollabPresenceRegistration>()
  private location: CollabLocation | null = null
  private send: (message: CollabClientMessage) => void = () => {}

  getSnapshot = (): CollabConnectionState => this.state
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setSender(send: (message: CollabClientMessage) => void): void {
    this.send = send
  }

  connecting(): void {
    this.publish({ status: 'connecting' })
  }

  disconnect(message?: string): void {
    for (const pending of this.pending.values()) {
      pending.uncertain = pending.acknowledgedRevision === undefined
    }
    for (const scope of this.scopes.values()) {
      scope.snapshot = { ...scope.snapshot, synced: false }
      scope.listeners.forEach(listener => listener())
    }
    this.publish({
      status: 'disconnected',
      connectionId: null,
      participants: [],
      ...(message ? { error: message } : {})
    })
  }

  // Identity changes cannot inherit another person's pending writes.
  resetIdentity(): void {
    for (const [id, pending] of [...this.pending])
      this.settle(
        id,
        pending.acknowledgedRevision !== undefined
          ? { status: 'committed', revision: pending.acknowledgedRevision }
          : {
              status: 'unknown',
              message:
                'The account changed before this save was confirmed. Review the current value.'
            }
      )
    this.disconnect()
  }

  setLocation(location: CollabLocation | null): void {
    this.location = location
    if (this.state.status === 'connected') this.send({ type: 'location', location })
  }

  getLocation(): CollabLocation | null {
    return this.location
  }

  setPresence(registration: CollabPresenceRegistration): void {
    this.registrations.set(registration.registrationId, registration)
    if (this.state.status === 'connected') this.send({ type: 'presence:set', ...registration })
  }

  deletePresence(registrationId: string): void {
    this.registrations.delete(registrationId)
    if (this.state.status === 'connected') this.send({ type: 'presence:delete', registrationId })
  }

  acquireScope(name: string): () => void {
    const scope = this.scope(name)
    scope.users++
    if (scope.users === 1) scope.subscriptionId = crypto.randomUUID()
    if (scope.users === 1 && this.state.status === 'connected') {
      this.send({ type: 'subscribe', scope: name, subscriptionId: scope.subscriptionId })
    }
    return () => {
      scope.users = Math.max(0, scope.users - 1)
      if (!scope.users && this.state.status === 'connected') {
        this.send({ type: 'unsubscribe', scope: name, subscriptionId: scope.subscriptionId })
        scope.snapshot = { ...scope.snapshot, synced: false }
      }
    }
  }

  getScopeSnapshot(name: string): SharedScopeState {
    return this.scope(name).snapshot
  }
  subscribeScope(name: string, listener: () => void): () => void {
    const scope = this.scope(name)
    scope.listeners.add(listener)
    return () => {
      scope.listeners.delete(listener)
    }
  }

  mutate(name: string, operations: CollabOperation[]): Promise<MutationOutcome> {
    const scope = this.scope(name)
    const reject = (message: string): Promise<MutationOutcome> => {
      scope.snapshot = { ...scope.snapshot, error: message }
      this.refreshScope(name)
      return Promise.resolve({ status: 'rejected', message })
    }
    if (this.state.status !== 'connected' || !scope.snapshot.synced)
      return reject('Reconnect before saving this change.')
    if (!operations.length) return reject('There are no changes to save.')
    try {
      if (
        operations.some(
          operation => !operation.key || (operation.type === 'set' && !isJson(operation.value))
        )
      )
        return reject('Shared values must contain plain JSON data.')
      operations = JSON.parse(JSON.stringify(operations)) as CollabOperation[]
    } catch {
      return reject('Shared values must contain plain JSON data without cycles.')
    }
    const operationId = crypto.randomUUID()
    return new Promise(resolve => {
      this.pending.set(operationId, { scope: name, operations, uncertain: false, resolve })
      scope.snapshot = { ...scope.snapshot, error: null }
      this.refreshScope(name)
      this.publish({ error: null })
      this.send({ type: 'mutate', scope: name, operationId, operations })
    })
  }

  receive(message: CollabServerMessage): void {
    switch (message.type) {
      case 'welcome': {
        this.publish({
          status: 'connected',
          connectionId: message.connectionId,
          participants: message.participants,
          error: null
        })
        for (const [name, scope] of this.scopes) {
          if (scope.users)
            this.send({ type: 'subscribe', scope: name, subscriptionId: scope.subscriptionId })
        }
        for (const registration of this.registrations.values())
          this.send({ type: 'presence:set', ...registration })
        const operationIds = [...this.pending]
          .filter(([, pending]) => pending.uncertain)
          .map(([id]) => id)
        if (operationIds.length)
          this.send({ type: 'receipts', requestId: crypto.randomUUID(), operationIds })
        break
      }
      case 'participants':
        this.publish({ participants: message.participants })
        break
      case 'snapshot': {
        const scope = this.scope(message.scope)
        if (message.subscriptionId !== scope.subscriptionId || !scope.users) return
        scope.confirmed = message.entries
        scope.snapshot = {
          ...scope.snapshot,
          loaded: true,
          synced: true,
          revision: message.revision
        }
        for (const [operationId, pending] of this.pending) {
          if (
            pending.scope === message.scope &&
            pending.acknowledgedRevision !== undefined &&
            pending.acknowledgedRevision <= message.revision
          ) {
            this.settle(operationId, {
              status: 'committed',
              revision: pending.acknowledgedRevision
            })
          }
        }
        this.refreshScope(message.scope)
        break
      }
      case 'update': {
        const scope = this.scope(message.scope)
        if (message.subscriptionId !== scope.subscriptionId || !scope.users) return
        if (message.revision > scope.snapshot.revision) {
          scope.confirmed = applyOperations(scope.confirmed, message.operations)
          scope.snapshot = { ...scope.snapshot, revision: message.revision }
        }
        if (this.pending.has(message.operationId))
          this.settle(message.operationId, { status: 'committed', revision: message.revision })
        else this.refreshScope(message.scope)
        break
      }
      case 'ack': {
        const pending = this.pending.get(message.operationId)
        if (!pending) return
        const scope = this.scope(message.scope)
        // An acknowledgement proves the write committed, but carries no state
        // for intervening writes. Never advance the authoritative revision from
        // an ack: doing so would make a later update look already applied.
        pending.acknowledgedRevision = message.revision
        pending.uncertain = false
        pending.resolve({ status: 'committed', revision: message.revision })
        if (scope.snapshot.synced && scope.snapshot.revision >= message.revision) {
          this.settle(message.operationId, { status: 'committed', revision: message.revision })
        } else {
          this.refreshScope(message.scope)
          this.publish({})
        }
        break
      }
      case 'receipts':
        for (const receipt of message.receipts) {
          this.settle(
            receipt.operationId,
            receipt.status === 'committed'
              ? { status: 'committed', revision: receipt.revision }
              : {
                  status: 'unknown',
                  message:
                    'This change could not be confirmed. Review the current value before trying again.'
                }
          )
        }
        break
      case 'error':
        if (message.operationId)
          this.settle(message.operationId, { status: 'rejected', message: message.message })
        else {
          if (message.subscriptionId) {
            for (const [name, scope] of this.scopes) {
              if (scope.subscriptionId === message.subscriptionId) {
                scope.snapshot = { ...scope.snapshot, error: message.message }
                this.refreshScope(name)
              }
            }
          }
          this.publish({ error: message.message })
        }
        break
      case 'pong':
        break
    }
  }

  private scope(name: string): Scope {
    let scope = this.scopes.get(name)
    if (!scope) {
      scope = {
        confirmed: {},
        subscriptionId: crypto.randomUUID(),
        users: 0,
        listeners: new Set(),
        snapshot: {
          entries: {},
          loaded: false,
          synced: false,
          revision: 0,
          isSaving: false,
          error: null
        }
      }
      this.scopes.set(name, scope)
    }
    return scope
  }

  private settle(operationId: string, outcome: MutationOutcome): void {
    const pending = this.pending.get(operationId)
    if (!pending) return
    this.pending.delete(operationId)
    const scope = this.scope(pending.scope)
    if (outcome.status !== 'committed')
      scope.snapshot = { ...scope.snapshot, error: outcome.message }
    this.refreshScope(pending.scope)
    this.publish(outcome.status === 'committed' ? {} : { error: outcome.message })
    pending.resolve(outcome)
  }

  private refreshScope(name: string): void {
    const scope = this.scope(name)
    let entries = scope.confirmed
    let isSaving = false
    for (const pending of this.pending.values()) {
      if (pending.scope !== name) continue
      entries = applyOperations(entries, pending.operations)
      if (pending.acknowledgedRevision === undefined) isSaving = true
    }
    scope.snapshot = { ...scope.snapshot, entries, isSaving }
    scope.listeners.forEach(listener => listener())
  }

  private publish(patch: Partial<CollabConnectionState>): void {
    this.state = {
      ...this.state,
      ...patch,
      pendingCount: [...this.pending.values()].filter(
        pending => pending.acknowledgedRevision === undefined
      ).length
    }
    this.listeners.forEach(listener => listener())
  }
}

export function participantForSelf(
  state: CollabConnectionState,
  identity: CollabIdentity
): CollabParticipant | null {
  if (!state.connectionId) return null
  return (
    state.participants.find(participant => participant.connectionId === state.connectionId) ?? {
      connectionId: state.connectionId,
      identity,
      location: null,
      presence: []
    }
  )
}
