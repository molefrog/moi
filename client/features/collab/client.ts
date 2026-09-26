import { wsUrl } from '@/client/lib/ws-url'
import type { CollabClientMessage, CollabServerMessage } from '@/lib/collab/types'

import { getIdentity, subscribeIdentityStore } from './identity'
import { CollabStore } from './store'

// One presence connection per mounted workspace with an explicit identity.
export class CollabClient {
  readonly store = new CollabStore()
  private socket: WebSocket | null = null
  private retry: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private unsubscribeIdentity: (() => void) | undefined
  private presenceTimer: ReturnType<typeof setTimeout> | undefined
  private queuedPresence = new Map<string, CollabClientMessage>()
  private stopped = true
  private attempts = 0
  private lastMessageAt = 0
  private userId = getIdentity()?.id ?? null

  constructor(readonly workspaceId: string) {
    this.store.setSender(message => this.send(message))
  }

  start(): () => void {
    this.stopped = false
    this.userId = getIdentity()?.id ?? null
    this.unsubscribeIdentity = subscribeIdentityStore(() => {
      const identity = getIdentity()
      if ((identity?.id ?? null) !== this.userId) {
        this.userId = identity?.id ?? null
        this.store.disconnect()
        clearTimeout(this.retry)
        if (this.socket) this.socket.close()
        else this.connect()
      } else if (identity) this.send({ type: 'identity', identity })
    })
    this.connect()
    return () => this.stop()
  }

  private wantsConnection(): boolean {
    return !this.stopped && getIdentity() !== null
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
      const identity = getIdentity()
      if (!identity) {
        socket.close()
        return
      }
      this.rawSend({ type: 'join', version: 2, identity, location: this.store.getLocation() })
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
      !getIdentity() &&
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
    this.unsubscribeIdentity?.()
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
