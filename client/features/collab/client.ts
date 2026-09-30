import { wsUrl } from '@/client/lib/ws-url'
import { COLLAB_PROTOCOL_VERSION } from '@/lib/collab/protocol'
import type { CollabClientMessage, CollabServerMessage } from '@/lib/collab/types'

import { getCurrentUser, subscribeCurrentUserStore } from './host-state'
import { CollabStore } from './store'

// One presence connection per mounted workspace with an explicit profile.
export class CollabClient {
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
  private userId = getCurrentUser()?.id ?? null

  constructor(readonly workspaceId: string) {
    this.store.setSender(message => this.send(message))
  }

  start(): () => void {
    if (!this.stopped) return () => {}
    this.stopped = false
    this.userId = getCurrentUser()?.id ?? null
    this.unsubscribeCurrentUser = subscribeCurrentUserStore(() => {
      const profile = getCurrentUser()
      if ((profile?.id ?? null) !== this.userId) {
        this.userId = profile?.id ?? null
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
    return !this.stopped && getCurrentUser() !== null
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
      this.rawSend({
        type: 'join',
        version: COLLAB_PROTOCOL_VERSION,
        profile,
        location: this.store.getLocation()
      })
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastMessageAt > 45_000) socket.close()
        else this.rawSend({ type: 'ping' })
      }, 15_000)
    }
    socket.onmessage = event => {
      if (socket !== this.socket) return
      this.lastMessageAt = Date.now()
      try {
        const message = JSON.parse(String(event.data)) as CollabServerMessage
        if (message.type === 'welcome') this.attempts = 0
        this.store.receive(message)
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
