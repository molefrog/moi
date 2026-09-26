import type {
  CollabClientMessage,
  CollabIdentity,
  CollabLocation,
  CollabParticipant,
  CollabPresenceRegistration,
  CollabServerMessage
} from '@/lib/collab/types'

export type CollabConnectionState = {
  status: 'connecting' | 'connected' | 'disconnected'
  connectionId: string | null
  participants: CollabParticipant[]
  // Current live profiles only. The host owns the full workspace directory.
  users: readonly CollabIdentity[]
  error: string | null
}

export const DISCONNECTED_STATE: CollabConnectionState = {
  status: 'disconnected',
  connectionId: null,
  participants: [],
  users: [],
  error: null
}

// Sockets and timers live in client.ts; this model owns ephemeral registrations.
export class CollabStore {
  private state: CollabConnectionState = DISCONNECTED_STATE
  private listeners = new Set<() => void>()
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
    this.publish({ status: 'connecting', error: null })
  }
  disconnect(message?: string): void {
    this.publish({ ...DISCONNECTED_STATE, error: message ?? null })
  }
  setLocation(location: CollabLocation | null): void {
    this.location = location
    // Page filters update immediately, without waiting for the server echo.
    this.publish({})
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
          participants: message.participants,
          users: message.users,
          error: null
        })
        for (const registration of this.registrations.values()) {
          this.send({ type: 'presence:set', ...registration })
        }
        break
      case 'participants':
        this.publish({ participants: message.participants, users: message.users })
        break
      case 'error':
        this.publish({ error: message.message })
        break
      case 'pong':
        break
    }
  }
  private publish(patch: Partial<CollabConnectionState>): void {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach(listener => listener())
  }
}
