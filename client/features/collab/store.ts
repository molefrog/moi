import type {
  CollabClientMessage,
  UserProfile,
  CollabJsonValue,
  CollabLocation,
  Connection,
  CollabPresenceRegistration,
  CollabServerMessage
} from '@/lib/collab/types'

export type CollabConnectionState = {
  status: 'connecting' | 'connected' | 'disconnected'
  connectionId: string | null
  connections: Connection[]
  // Current live profiles only. The host owns the full workspace directory.
  users: readonly UserProfile[]
  error: string | null
}

export const DISCONNECTED_STATE: CollabConnectionState = {
  status: 'disconnected',
  connectionId: null,
  connections: [],
  users: [],
  error: null
}

export type CollabPresenceEntry = {
  registrationId: string
  connectionId: string
  userId: string
  value: CollabJsonValue
}

const EMPTY_PRESENCE: readonly CollabPresenceEntry[] = []
const channelKey = (surface: string, channel: string) => JSON.stringify([surface, channel])

// Sockets and timers live in client.ts; this model owns ephemeral registrations.
export class CollabStore {
  private state: CollabConnectionState = DISCONNECTED_STATE
  private usersState: CollabConnectionState = DISCONNECTED_STATE
  private channels = new Map<string, readonly CollabPresenceEntry[]>()
  private listeners = new Set<() => void>()
  private registrations = new Map<string, CollabPresenceRegistration>()
  private location: CollabLocation | null = null
  private send: (message: CollabClientMessage) => void = () => {}

  getSnapshot = (): CollabConnectionState => this.state
  // User hooks never need cursor coordinates or other publication payloads.
  getUsersSnapshot = (): CollabConnectionState => this.usersState
  getPresenceSnapshot = (surface: string, channel: string): readonly CollabPresenceEntry[] =>
    this.channels.get(channelKey(surface, channel)) ?? EMPTY_PRESENCE
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
    this.publish({ status: 'connecting', error: null })
  }
  disconnect(message?: string): void {
    this.publish({ ...DISCONNECTED_STATE, error: message ?? null })
  }
  setLocation(location: CollabLocation | null): void {
    if (JSON.stringify(this.location) === JSON.stringify(location)) return
    this.location = location
    // Page filters update immediately, without waiting for the server echo.
    this.publish({}, true)
    if (this.state.status === 'connected') this.send({ type: 'location', location })
  }
  getLocation(): CollabLocation | null {
    return this.location
  }
  setPresence(registration: CollabPresenceRegistration): void {
    const previous = this.registrations.get(registration.registrationId)
    if (previous && JSON.stringify(previous) === JSON.stringify(registration)) return
    this.registrations.set(registration.registrationId, registration)
    if (this.state.status === 'connected') this.send({ type: 'presence:set', ...registration })
  }
  deletePresence(registrationId: string): void {
    this.registrations.delete(registrationId)
    if (this.state.status === 'connected') this.send({ type: 'presence:delete', registrationId })
  }
  receive(message: CollabServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.publish({
          status: 'connected',
          connectionId: message.connectionId,
          connections: message.connections,
          users: message.users,
          error: null
        })
        for (const registration of this.registrations.values()) {
          this.send({ type: 'presence:set', ...registration })
        }
        break
      case 'connections':
        this.publish({ connections: message.connections, users: message.users })
        break
      case 'error':
        this.publish({ error: message.message })
        break
      case 'pong':
        break
    }
  }
  private publish(patch: Partial<CollabConnectionState>, locationChanged = false): void {
    this.state = { ...this.state, ...patch }
    const users = {
      ...this.state,
      connections: this.state.connections.map(connection => ({ ...connection, presence: [] }))
    }
    if (locationChanged || JSON.stringify(users) !== JSON.stringify(this.usersState)) {
      this.usersState = users
    }
    const channels = new Map<string, CollabPresenceEntry[]>()
    if (this.location?.status === 'active') {
      for (const connection of this.state.connections) {
        if (
          connection.connectionId === this.state.connectionId ||
          connection.location?.page !== this.location.page ||
          connection.location.status !== 'active'
        )
          continue
        for (const registration of connection.presence) {
          const key = channelKey(registration.surface, registration.channel)
          const entries = channels.get(key) ?? []
          entries.push({
            registrationId: registration.registrationId,
            connectionId: connection.connectionId,
            userId: connection.userId,
            value: registration.value
          })
          channels.set(key, entries)
        }
      }
    }
    // Keep references for unchanged channels. Only current nonempty channels are
    // retained, so navigating through many records does not grow a selector cache.
    this.channels = new Map(
      [...channels].map(([key, entries]) => {
        const previous = this.channels.get(key)
        return [
          key,
          previous && JSON.stringify(previous) === JSON.stringify(entries) ? previous : entries
        ]
      })
    )
    this.listeners.forEach(listener => listener())
  }
}
