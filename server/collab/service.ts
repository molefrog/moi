import {
  COLLAB_MAX_CONNECTIONS,
  COLLAB_MAX_REGISTRATIONS,
  COLLAB_PROTOCOL_VERSION
} from '@/lib/collab/protocol'
import type {
  CollabClientMessage,
  CollabServerMessage,
  Connection,
  UserProfile
} from '@/lib/collab/types'

type Emit = (connectionId: string, message: CollabServerMessage) => void
type Client = {
  profile: UserProfile
  connection: Connection
}

function cleanProfile(profile: UserProfile): UserProfile {
  return {
    id: profile.id,
    ...(profile.name !== undefined ? { name: profile.name } : {}),
    color: profile.color,
    ...(profile.avatar !== undefined ? { avatar: profile.avatar } : {}),
    ...(profile.email !== undefined ? { email: profile.email } : {})
  }
}

// One process owns this ephemeral room. No workspace data is read or written.
export class CollabService {
  private clients = new Map<string, Client>()
  private presenceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private emit: Emit) {}

  private snapshot() {
    const users = new Map<string, UserProfile>()
    const connections: Connection[] = []
    for (const { profile, connection } of this.clients.values()) {
      users.set(profile.id, profile)
      connections.push(connection)
    }
    return { connections, users: [...users.values()] }
  }

  private publishConnections() {
    if (this.presenceTimer) clearTimeout(this.presenceTimer)
    this.presenceTimer = null
    const message: CollabServerMessage = { type: 'connections', ...this.snapshot() }
    for (const id of this.clients.keys()) this.emit(id, message)
  }

  private scheduleConnections() {
    this.presenceTimer ??= setTimeout(() => this.publishConnections(), 50)
  }

  receive(connectionId: string, message: CollabClientMessage) {
    if (message.type === 'join') {
      if (this.clients.has(connectionId)) throw new Error('This connection already joined')
      if (this.clients.size >= COLLAB_MAX_CONNECTIONS)
        throw new Error('This workspace has too many connections')
      const profile = cleanProfile(message.profile)
      // Keep one current profile across a user's tabs, without sharing their presence.
      for (const client of this.clients.values()) {
        if (client.profile.id === profile.id) client.profile = profile
      }
      this.clients.set(connectionId, {
        profile,
        connection: {
          connectionId,
          userId: profile.id,
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
      this.publishConnections()
      return
    }

    const client = this.clients.get(connectionId)
    if (!client) throw new Error('Join the workspace before sending collab messages')
    const { connection } = client
    switch (message.type) {
      case 'profile': {
        if (message.profile.id !== connection.userId) throw new Error('Reconnect to change user ID')
        const profile = cleanProfile(message.profile)
        for (const other of this.clients.values()) {
          if (other.profile.id === profile.id) other.profile = profile
        }
        this.publishConnections()
        return
      }
      case 'location':
        connection.location = message.location
        this.scheduleConnections()
        return
      case 'presence:set': {
        const presence = connection.presence
        const index = presence.findIndex(item => item.registrationId === message.registrationId)
        if (index < 0 && presence.length >= COLLAB_MAX_REGISTRATIONS)
          throw new Error('Too many presence registrations')
        const { registrationId, surface, channel, value } = message
        const registration = { registrationId, surface, channel, value }
        if (index >= 0) presence[index] = registration
        else presence.push(registration)
        this.scheduleConnections()
        return
      }
      case 'presence:delete':
        connection.presence = connection.presence.filter(
          item => item.registrationId !== message.registrationId
        )
        this.scheduleConnections()
        return
      case 'ping':
        this.emit(connectionId, { type: 'pong' })
        return
    }
  }

  leave(connectionId: string) {
    if (this.clients.delete(connectionId)) this.publishConnections()
  }

  close() {
    if (this.presenceTimer) clearTimeout(this.presenceTimer)
    this.presenceTimer = null
    this.clients.clear()
  }
}
