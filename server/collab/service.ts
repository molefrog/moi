import type {
  CollabActor,
  CollabClientMessage,
  CollabCommand,
  CollabCommandResult,
  CollabIdentity,
  CollabParticipant,
  CollabServerMessage
} from '@/lib/collab/types'

import type { openCollabStorage } from './storage'

type Storage = ReturnType<typeof openCollabStorage>
type Emit = (connectionId: string, message: CollabServerMessage) => void
type Client = {
  actor: CollabActor
  participant: CollabParticipant | null
  subscriptions: Map<string, string>
}

function cleanIdentity(identity: CollabIdentity): CollabIdentity {
  return {
    id: identity.id,
    name: identity.name,
    color: identity.color,
    ...(identity.avatar ? { avatar: identity.avatar } : {})
  }
}

// Include actor kind so an agent id cannot collide with a human id's receipts.
function actorKey(actor: CollabActor): string {
  return `${actor.kind}:${actor.id}`
}

export class CollabService {
  private clients = new Map<string, Client>()
  private presenceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private storage: Storage,
    private emit: Emit
  ) {}

  private participants(): CollabParticipant[] {
    return [...this.clients.values()].flatMap(client =>
      client.participant ? [client.participant] : []
    )
  }

  private publishParticipants() {
    if (this.presenceTimer) clearTimeout(this.presenceTimer)
    this.presenceTimer = null
    const message: CollabServerMessage = { type: 'participants', participants: this.participants() }
    for (const id of this.clients.keys()) this.emit(id, message)
  }

  // Remembers a profile in the people directory and tells everyone else when
  // it is new or changed, so ids keep resolving after the person leaves.
  private rememberPerson(identity: CollabIdentity, except?: string) {
    if (!this.storage.upsertPerson(identity)) return
    const message: CollabServerMessage = { type: 'people', people: [identity] }
    for (const id of this.clients.keys()) if (id !== except) this.emit(id, message)
  }

  private scheduleParticipants() {
    this.presenceTimer ??= setTimeout(() => this.publishParticipants(), 50)
  }

  receive(connectionId: string, message: CollabClientMessage) {
    if (message.type === 'join') {
      if (this.clients.has(connectionId)) throw new Error('This connection already joined')
      if (this.clients.size >= 32) throw new Error('This workspace has too many connections')
      const identity = message.identity ? cleanIdentity(message.identity) : null
      this.clients.set(connectionId, {
        actor: message.identity
          ? { id: message.identity.id, kind: 'user' }
          : { id: `anonymous:${message.anonymousId}`, kind: 'system' },
        participant: identity
          ? {
              connectionId,
              identity,
              location: 'location' in message ? (message.location ?? null) : null,
              presence: []
            }
          : null,
        subscriptions: new Map()
      })
      if (identity) this.rememberPerson(identity, connectionId)
      this.emit(connectionId, {
        type: 'welcome',
        version: 1,
        connectionId,
        identity,
        participants: this.participants(),
        people: this.storage.listPeople()
      })
      this.publishParticipants()
      return
    }

    const client = this.clients.get(connectionId)
    if (!client) throw new Error('Join the workspace before sending collab messages')
    const { actor, participant } = client
    switch (message.type) {
      case 'identity': {
        if (!participant || message.identity.id !== actor.id)
          throw new Error('Reconnect to change identity')
        participant.identity = cleanIdentity(message.identity)
        this.rememberPerson(participant.identity)
        this.publishParticipants()
        return
      }
      case 'location':
        if (!participant) return
        participant.location = message.location
        this.scheduleParticipants()
        return
      case 'presence:set': {
        if (!participant) return
        const presence = participant.presence
        const index = presence.findIndex(item => item.registrationId === message.registrationId)
        if (index < 0 && presence.length >= 64) throw new Error('Too many presence registrations')
        const { registrationId, surface, channel, value } = message
        const registration = { registrationId, surface, channel, value }
        if (index >= 0) presence[index] = registration
        else presence.push(registration)
        this.scheduleParticipants()
        return
      }
      case 'presence:delete':
        if (!participant) return
        participant.presence = participant.presence.filter(
          item => item.registrationId !== message.registrationId
        )
        this.scheduleParticipants()
        return
      case 'subscribe': {
        if (!client.subscriptions.has(message.subscriptionId) && client.subscriptions.size >= 64) {
          throw new Error('Too many storage subscriptions')
        }
        const snapshot = this.storage.snapshot(message.scope)
        // No await between snapshot and registration: every subsequent mutation sees this reader.
        client.subscriptions.set(message.subscriptionId, message.scope)
        this.emit(connectionId, {
          type: 'snapshot',
          subscriptionId: message.subscriptionId,
          ...snapshot
        })
        return
      }
      case 'unsubscribe':
        if (client.subscriptions.get(message.subscriptionId) === message.scope) {
          client.subscriptions.delete(message.subscriptionId)
        }
        return
      case 'mutate': {
        const result = this.mutate(actor, message)
        this.emit(connectionId, {
          type: 'ack',
          scope: result.scope,
          operationId: result.operationId,
          revision: result.revision,
          duplicate: result.duplicate
        })
        return
      }
      case 'receipts':
        this.emit(connectionId, {
          type: 'receipts',
          requestId: message.requestId,
          receipts: this.storage.lookupReceipts(actorKey(actor), message.operationIds)
        })
        return
      case 'ping':
        this.emit(connectionId, { type: 'pong' })
        return
    }
  }

  private mutate(actor: CollabActor, command: Extract<CollabCommand, { type: 'mutate' }>) {
    const result = this.storage.mutate(
      command.scope,
      actorKey(actor),
      command.operationId,
      command.operations
    )
    if (!result.duplicate) {
      for (const [connectionId, client] of this.clients) {
        for (const [subscriptionId, scope] of client.subscriptions) {
          if (scope !== command.scope) continue
          this.emit(connectionId, {
            type: 'update',
            scope,
            subscriptionId,
            revision: result.revision,
            operationId: result.operationId,
            operations: result.operations
          })
        }
      }
    }
    return result
  }

  run(actor: CollabActor, command: CollabCommand): CollabCommandResult {
    switch (command.type) {
      case 'snapshot':
        return this.storage.snapshot(command.scope)
      case 'mutate':
        return this.mutate(actor, command)
      case 'receipts':
        return this.storage.lookupReceipts(actorKey(actor), command.operationIds)
      case 'export':
        this.storage.exportTo(command.path)
        return null
    }
  }

  leave(connectionId: string) {
    if (this.clients.delete(connectionId)) this.publishParticipants()
  }

  close() {
    if (this.presenceTimer) clearTimeout(this.presenceTimer)
    this.presenceTimer = null
    this.clients.clear()
    this.storage.close()
  }
}
