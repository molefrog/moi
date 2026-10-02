import type { JsonValue } from 'moi'
import type {
  CollabClientMessage,
  UserProfile,
  ConnectionLocation,
  Connection,
  PresenceRegistration,
  CollabServerMessage
} from '@/lib/collab/types'

export type ClientState = {
  status: 'connecting' | 'connected' | 'disconnected'
  connectionId: string | null
  connections: Connection[]
  // Current live profiles only. The host owns the full workspace directory.
  users: readonly UserProfile[]
  error: string | null
}

export const DISCONNECTED_STATE: ClientState = {
  status: 'disconnected',
  connectionId: null,
  connections: [],
  users: [],
  error: null
}

export type PresenceEntry = {
  registrationId: string
  connectionId: string
  userId: string
  value: JsonValue
}

const EMPTY_PRESENCE: readonly PresenceEntry[] = []
const channelKey = (appletId: string, channel: string) => JSON.stringify([appletId, channel])

// Sockets and timers live in client.ts; this model owns ephemeral registrations.
export class CollabStore {
  private state: ClientState = DISCONNECTED_STATE
  private usersState: ClientState = DISCONNECTED_STATE
  private channels = new Map<string, readonly PresenceEntry[]>()
  private listeners = new Set<() => void>()
  private registrations = new Map<string, PresenceRegistration>()
  private location: ConnectionLocation | null = null
  private send: (message: CollabClientMessage) => void = () => {}

  getSnapshot = (): ClientState => this.state
  // User hooks never need cursor coordinates or other publication payloads.
  getUsersSnapshot = (): ClientState => this.usersState
  getPresenceSnapshot = (appletId: string, channel: string): readonly PresenceEntry[] =>
    this.channels.get(channelKey(appletId, channel)) ?? EMPTY_PRESENCE
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
  setLocation(location: ConnectionLocation | null): void {
    if (JSON.stringify(this.location) === JSON.stringify(location)) return
    this.location = location
    // Page filters update immediately, without waiting for the server echo.
    this.publish({}, true)
    if (this.state.status === 'connected') this.send({ type: 'location', location })
  }
  getLocation(): ConnectionLocation | null {
    return this.location
  }
  setPresence(registration: PresenceRegistration): void {
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
  private publish(patch: Partial<ClientState>, locationChanged = false): void {
    this.state = { ...this.state, ...patch }
    const users = {
      ...this.state,
      connections: this.state.connections.map(connection => ({ ...connection, presence: [] }))
    }
    if (locationChanged || JSON.stringify(users) !== JSON.stringify(this.usersState)) {
      this.usersState = users
    }
    const channels = new Map<string, PresenceEntry[]>()
    if (this.location?.status === 'active') {
      for (const connection of this.state.connections) {
        if (
          connection.connectionId === this.state.connectionId ||
          connection.location?.page !== this.location.page ||
          connection.location.status !== 'active'
        )
          continue
        for (const registration of connection.presence) {
          const key = channelKey(registration.appletId, registration.channel)
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
