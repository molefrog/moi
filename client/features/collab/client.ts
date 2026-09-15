import { wsUrl } from '@/client/lib/ws-url'
import type { CollabClientMessage, CollabServerMessage } from '@/lib/collab/types'

import { getIdentity, subscribeIdentityStore } from './identity'
import { CollabStore } from './store'

// One transport per mounted workspace. An explicit identity joins presence;
// otherwise shared-state hooks acquire an anonymous connection only while used.
export class CollabClient {
  readonly store = new CollabStore()
  private socket: WebSocket | null = null
  private retry: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private unsubscribeIdentity: (() => void) | undefined
  private presenceTimer: ReturnType<typeof setTimeout> | undefined
  private queuedPresence = new Map<string, CollabClientMessage>()
  private writeTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
  private stopped = true
  private attempts = 0
  private lastMessageAt = 0
  private userId = getIdentity()?.id ?? null
  private readonly anonymousId = crypto.randomUUID()
  private sharedStateUsers = 0

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
        this.store.resetIdentity()
        clearTimeout(this.retry)
        if (this.socket) this.socket.close()
        else this.connect()
      } else if (identity) this.send({ type: 'identity', identity })
    })
    this.connect()
    return () => this.stop()
  }

  acquireSharedState(): () => void {
    this.sharedStateUsers++
    if (!this.socket) this.connect()
    return () => {
      this.sharedStateUsers = Math.max(0, this.sharedStateUsers - 1)
      if (!this.wantsConnection()) {
        clearTimeout(this.retry)
        this.socket?.close()
      }
    }
  }

  private wantsConnection(): boolean {
    return !this.stopped && (getIdentity() !== null || this.sharedStateUsers > 0)
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
      this.rawSend(
        identity
          ? { type: 'join', version: 1, identity, location: this.store.getLocation() }
          : { type: 'join', version: 1, identity: null, anonymousId: this.anonymousId }
      )
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
        if (
          message.type === 'ack' ||
          message.type === 'update' ||
          (message.type === 'error' && message.operationId)
        ) {
          const operationId = message.operationId
          if (operationId) {
            clearTimeout(this.writeTimeouts.get(operationId))
            this.writeTimeouts.delete(operationId)
          }
        }
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
      for (const timeout of this.writeTimeouts.values()) clearTimeout(timeout)
      this.writeTimeouts.clear()
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
    if (message.type === 'mutate') {
      // An open connection is not proof a save completed. Reconnect and ask
      // for its receipt if an acknowledgement never arrives.
      this.writeTimeouts.set(
        message.operationId,
        setTimeout(() => this.socket?.close(), 15_000)
      )
    }
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
    for (const timeout of this.writeTimeouts.values()) clearTimeout(timeout)
    this.writeTimeouts.clear()
    this.socket?.close()
    this.socket = null
    this.store.disconnect()
  }
}
