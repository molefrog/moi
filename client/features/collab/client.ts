import { wsUrl } from '@/client/lib/ws-url'
import { COLLAB_PROTOCOL_VERSION } from '@/lib/collab/protocol'
import type {
  CollabClientMessage,
  CollabServerMessage,
  UserProfile,
  ConnectionLocation,
  PresenceRegistration
} from '@/lib/collab/types'

import {
  getCurrentUser,
  getWorkspaceDirectory,
  subscribeCurrentUserStore,
  subscribeWorkspaceUsersStore
} from './host-state'
import type { WorkspaceDirectory } from './host-state'
import { CollabStore, DISCONNECTED_STATE } from './store'
import type { ClientState, PresenceEntry } from './store'

type Unsubscribe = () => void

// A workspace exposes one engine to React. The playground implements this same
// contract; sockets, timers, and registration storage stay behind it.
export type CollabEngineApi = {
  readonly workspaceId: string
  readonly enabled: boolean
  start: () => Unsubscribe
  getSnapshot: () => ClientState
  getUsersSnapshot: () => ClientState
  getPresenceSnapshot: (appletId: string, channel: string) => readonly PresenceEntry[]
  subscribe: (listener: () => void) => Unsubscribe
  getCurrentUser: () => UserProfile | undefined
  subscribeCurrentUser: (listener: () => void) => Unsubscribe
  getWorkspaceDirectory: () => WorkspaceDirectory
  subscribeWorkspaceUsers: (listener: () => void) => Unsubscribe
  getLocation: () => ConnectionLocation | null
  setLocation: (location: ConnectionLocation | null) => void
  setPresence: (registration: PresenceRegistration) => void
  deletePresence: (registrationId: string) => void
}

const noop = () => {}
const EMPTY_PRESENCE: readonly PresenceEntry[] = []
const UNAVAILABLE_DIRECTORY: WorkspaceDirectory = { status: 'unavailable', users: [] }

export const NO_ENGINE: CollabEngineApi = {
  workspaceId: '',
  enabled: false,
  start: () => noop,
  getSnapshot: () => DISCONNECTED_STATE,
  getUsersSnapshot: () => DISCONNECTED_STATE,
  getPresenceSnapshot: () => EMPTY_PRESENCE,
  subscribe: () => noop,
  getCurrentUser,
  subscribeCurrentUser: subscribeCurrentUserStore,
  getWorkspaceDirectory: () => UNAVAILABLE_DIRECTORY,
  subscribeWorkspaceUsers: () => noop,
  getLocation: () => null,
  setLocation: noop,
  setPresence: noop,
  deletePresence: noop
}

// One presence connection per mounted workspace with an explicit profile.
export class CollabClient implements CollabEngineApi {
  readonly store = new CollabStore()
  private socket: WebSocket | null = null
  private retry: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private unsubscribeCurrentUser: (() => void) | undefined
  private presenceTimer: ReturnType<typeof setTimeout> | undefined
  private queuedPresence = new Map<string, CollabClientMessage>()
  private stopped = true
  private attempts = 0
  private lastMessageAt = 0
  private userId = getCurrentUser()?.id

  constructor(
    readonly workspaceId: string,
    readonly enabled = true
  ) {
    this.store.setSender(message => this.send(message))
  }

  getSnapshot = (): ClientState => (this.enabled ? this.store.getSnapshot() : DISCONNECTED_STATE)
  getUsersSnapshot = (): ClientState =>
    this.enabled ? this.store.getUsersSnapshot() : DISCONNECTED_STATE
  getPresenceSnapshot = (appletId: string, channel: string): readonly PresenceEntry[] =>
    this.enabled ? this.store.getPresenceSnapshot(appletId, channel) : EMPTY_PRESENCE
  subscribe = (listener: () => void): Unsubscribe =>
    this.enabled ? this.store.subscribe(listener) : noop
  getCurrentUser = getCurrentUser
  subscribeCurrentUser = subscribeCurrentUserStore
  getWorkspaceDirectory = (): WorkspaceDirectory => getWorkspaceDirectory(this.workspaceId)
  subscribeWorkspaceUsers = (listener: () => void): Unsubscribe =>
    subscribeWorkspaceUsersStore(this.workspaceId, listener)
  getLocation = (): ConnectionLocation | null => (this.enabled ? this.store.getLocation() : null)
  setLocation = (location: ConnectionLocation | null): void => {
    this.store.setLocation(location)
  }
  setPresence = (registration: PresenceRegistration): void => {
    if (this.enabled) this.store.setPresence(registration)
  }
  deletePresence = (registrationId: string): void => {
    if (this.enabled) this.store.deletePresence(registrationId)
  }

  start(): () => void {
    if (!this.enabled) return noop
    if (!this.stopped) return () => {}
    this.stopped = false
    this.userId = getCurrentUser()?.id
    this.unsubscribeCurrentUser = subscribeCurrentUserStore(() => {
      const profile = getCurrentUser()
      if (profile?.id !== this.userId) {
        this.userId = profile?.id
        this.store.disconnect()
        clearTimeout(this.retry)
        if (this.socket) this.socket.close()
        else this.connect()
      } else if (profile) this.send({ type: 'profile', profile })
    })
    this.connect()
    return () => this.stop()
  }

  private wantsConnection(): boolean {
    return !this.stopped && getCurrentUser() !== undefined
  }

  private connect(): void {
    if (!this.wantsConnection()) {
      this.store.disconnect()
      return
    }
    if (this.socket) return
    clearTimeout(this.retry)
    this.store.connecting()
    const socket = new WebSocket(
      wsUrl(`/api/workspaces/${encodeURIComponent(this.workspaceId)}/collab/ws`)
    )
    this.socket = socket
    socket.onopen = () => {
      if (socket !== this.socket) return
      this.lastMessageAt = Date.now()
      const profile = getCurrentUser()
      if (!profile) {
        socket.close()
        return
      }
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastMessageAt > 45_000) socket.close()
        else this.rawSend({ type: 'ping' })
      }, 15_000)
      this.rawSend({
        type: 'join',
        version: COLLAB_PROTOCOL_VERSION,
        profile,
        location: this.store.getLocation()
      })
    }
    socket.onmessage = event => {
      if (socket !== this.socket) return
      this.lastMessageAt = Date.now()
      try {
        const message = JSON.parse(String(event.data)) as CollabServerMessage
        if (message.type === 'welcome') this.attempts = 0
        const rejectedJoin =
          message.type === 'error' && this.store.getSnapshot().status !== 'connected'
        this.store.receive(message)
        if (rejectedJoin) socket.close()
      } catch {
        this.store.disconnect('The collaboration connection returned an invalid message.')
        socket.close()
      }
    }
    socket.onerror = () => socket.close()
    socket.onclose = () => {
      if (socket !== this.socket) return
      clearInterval(this.heartbeat)
      clearTimeout(this.presenceTimer)
      this.presenceTimer = undefined
      this.queuedPresence.clear()
      this.socket = null
      this.store.disconnect()
      if (this.wantsConnection()) {
        const delay = Math.min(500 * 2 ** this.attempts++, 10_000)
        this.retry = setTimeout(() => this.connect(), delay)
      }
    }
  }

  private send(message: CollabClientMessage): void {
    if (
      !getCurrentUser() &&
      (message.type === 'location' ||
        message.type === 'presence:set' ||
        message.type === 'presence:delete')
    )
      return
    if (message.type === 'presence:set') {
      this.queuedPresence.set(message.registrationId, message)
      if (!this.presenceTimer) {
        this.presenceTimer = setTimeout(() => {
          this.presenceTimer = undefined
          for (const update of this.queuedPresence.values()) this.rawSend(update)
          this.queuedPresence.clear()
        }, 50)
      }
      return
    }
    if (message.type === 'presence:delete') this.queuedPresence.delete(message.registrationId)
    this.rawSend(message)
  }

  private rawSend(message: CollabClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(message))
      } catch {
        this.socket.close()
      }
    }
  }

  private stop(): void {
    this.stopped = true
    this.unsubscribeCurrentUser?.()
    clearTimeout(this.retry)
    clearTimeout(this.presenceTimer)
    this.presenceTimer = undefined
    clearInterval(this.heartbeat)
    this.queuedPresence.clear()
    this.socket?.close()
    this.socket = null
    this.store.disconnect()
  }
}
