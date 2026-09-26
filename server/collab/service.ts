import { COLLAB_PROTOCOL_VERSION } from '@/lib/collab/protocol'
import type {
  CollabClientMessage,
  CollabIdentity,
  CollabParticipant,
  CollabServerMessage
} from '@/lib/collab/types'

type Emit = (connectionId: string, message: CollabServerMessage) => void
type Client = {
  identity: CollabIdentity
  participant: CollabParticipant
}

function cleanIdentity(identity: CollabIdentity): CollabIdentity {
  return {
    id: identity.id,
    name: identity.name,
    color: identity.color,
    ...(identity.avatar ? { avatar: identity.avatar } : {}),
    ...(identity.email ? { email: identity.email } : {})
  }
}

// One process owns this ephemeral room. No workspace data is read or written.
export class CollabService {
  private clients = new Map<string, Client>()
  private presenceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private emit: Emit) {}

  private snapshot() {
    const users = new Map<string, CollabIdentity>()
    const participants: CollabParticipant[] = []
    for (const { identity, participant } of this.clients.values()) {
      users.set(identity.id, identity)
      participants.push(participant)
    }
    return { participants, users: [...users.values()] }
  }

  private publishParticipants() {
    if (this.presenceTimer) clearTimeout(this.presenceTimer)
    this.presenceTimer = null
    const message: CollabServerMessage = { type: 'participants', ...this.snapshot() }
    for (const id of this.clients.keys()) this.emit(id, message)
  }

  private scheduleParticipants() {
    this.presenceTimer ??= setTimeout(() => this.publishParticipants(), 50)
  }

  receive(connectionId: string, message: CollabClientMessage) {
    if (message.type === 'join') {
      if (this.clients.has(connectionId)) throw new Error('This connection already joined')
      if (this.clients.size >= 32) throw new Error('This workspace has too many connections')
      const identity = cleanIdentity(message.identity)
      // Keep one current profile across a user's tabs, without sharing their presence.
      for (const client of this.clients.values()) {
        if (client.identity.id === identity.id) client.identity = identity
      }
      this.clients.set(connectionId, {
        identity,
        participant: {
          connectionId,
          userId: identity.id,
          location: message.location ?? null,
          presence: []
        }
      })
      this.emit(connectionId, {
        type: 'welcome',
        version: COLLAB_PROTOCOL_VERSION,
        connectionId,
        ...this.snapshot()
      })
      this.publishParticipants()
      return
    }

    const client = this.clients.get(connectionId)
    if (!client) throw new Error('Join the workspace before sending collab messages')
    const { participant } = client
    switch (message.type) {
      case 'identity': {
        if (message.identity.id !== participant.userId)
          throw new Error('Reconnect to change identity')
        const identity = cleanIdentity(message.identity)
        for (const other of this.clients.values()) {
          if (other.identity.id === identity.id) other.identity = identity
        }
        this.publishParticipants()
        return
      }
      case 'location':
        participant.location = message.location
        this.scheduleParticipants()
        return
      case 'presence:set': {
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
        participant.presence = participant.presence.filter(
          item => item.registrationId !== message.registrationId
        )
        this.scheduleParticipants()
        return
      case 'ping':
        this.emit(connectionId, { type: 'pong' })
        return
    }
  }

  leave(connectionId: string) {
    if (this.clients.delete(connectionId)) this.publishParticipants()
  }

  close() {
    if (this.presenceTimer) clearTimeout(this.presenceTimer)
    this.presenceTimer = null
    this.clients.clear()
  }
}
