export type CollabJsonValue =
  | null
  | boolean
  | number
  | string
  | CollabJsonValue[]
  | { [key: string]: CollabJsonValue }

export type CollabIdentity = {
  id: string
  name: string
  avatar?: string
  color: string
}

export type CollabLocation = { page: string; title?: string }
export type CollabActor = { id: string; kind: 'user' | 'agent' | 'system'; onBehalfOf?: string }

export type CollabOperation =
  | { type: 'set'; key: string; value: CollabJsonValue }
  | { type: 'delete'; key: string }

export type CollabScopeSnapshot = {
  scope: string
  revision: number
  entries: Record<string, CollabJsonValue>
}

export type CollabMutationResult = {
  scope: string
  operationId: string
  revision: number
  operations: CollabOperation[]
  duplicate: boolean
}

export type CollabReceipt =
  | { operationId: string; status: 'unknown' }
  | { operationId: string; status: 'committed'; scope: string; revision: number }

export type CollabPresenceRegistration = {
  registrationId: string
  surface: string
  channel: string
  value: CollabJsonValue
}

export type CollabParticipant = {
  connectionId: string
  identity: CollabIdentity
  location: CollabLocation | null
  presence: CollabPresenceRegistration[]
}

export type CollabClientMessage =
  | { type: 'join'; version: 1; identity: CollabIdentity; location?: CollabLocation | null }
  | { type: 'join'; version: 1; identity: null; anonymousId: string }
  | { type: 'identity'; identity: CollabIdentity }
  | { type: 'location'; location: CollabLocation | null }
  | ({ type: 'presence:set' } & CollabPresenceRegistration)
  | { type: 'presence:delete'; registrationId: string }
  | { type: 'subscribe'; scope: string; subscriptionId: string }
  | { type: 'unsubscribe'; scope: string; subscriptionId: string }
  | { type: 'mutate'; scope: string; operationId: string; operations: CollabOperation[] }
  | { type: 'receipts'; requestId: string; operationIds: string[] }
  | { type: 'ping' }

export type CollabServerMessage =
  | {
      type: 'welcome'
      version: 1
      connectionId: string
      identity: CollabIdentity | null
      participants: CollabParticipant[]
      // Everyone who has joined this workspace, so an id still resolves to a
      // name and face after that person has left.
      people: CollabIdentity[]
    }
  | { type: 'participants'; participants: CollabParticipant[] }
  | { type: 'people'; people: CollabIdentity[] }
  | ({ type: 'snapshot'; subscriptionId: string } & CollabScopeSnapshot)
  | {
      type: 'update'
      scope: string
      revision: number
      operations: CollabOperation[]
      operationId: string
      subscriptionId: string
    }
  | { type: 'ack'; scope: string; operationId: string; revision: number; duplicate: boolean }
  | { type: 'receipts'; requestId: string; receipts: CollabReceipt[] }
  | {
      type: 'error'
      code: string
      message: string
      operationId?: string
      subscriptionId?: string
      requestId?: string
    }
  | { type: 'pong' }

export type CollabCommand =
  | { type: 'snapshot'; scope: string }
  | { type: 'mutate'; scope: string; operationId: string; operations: CollabOperation[] }
  | { type: 'receipts'; operationIds: string[] }
  | { type: 'export'; path: string }

export type CollabCommandResult =
  | CollabScopeSnapshot
  | CollabMutationResult
  | CollabReceipt[]
  | null
