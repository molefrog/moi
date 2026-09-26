import { afterEach, beforeEach, expect, test } from 'bun:test'

import { isCollabClientMessage } from '@/lib/collab/protocol'
import type { CollabClientMessage } from '@/lib/collab/types'
import { CollabService } from '@/server/collab/service'

import { CollabClient } from './client'
import { getIdentity, setIdentity } from './identity'

const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
const originalWebSocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket')
let service: CollabService
let sockets: TestSocket[]
let stop: (() => void) | undefined

class TestSocket {
  static OPEN = 1
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  readonly sent: CollabClientMessage[] = []
  readonly id: string
  constructor(readonly url: string) {
    this.id = `connection-${sockets.length}`
    sockets.push(this)
  }
  open() {
    this.readyState = TestSocket.OPEN
    this.onopen?.()
  }
  send(data: string) {
    const message: unknown = JSON.parse(data)
    if (!isCollabClientMessage(message)) throw new Error('Invalid collab message')
    this.sent.push(message)
    service.receive(this.id, message)
  }
  close() {
    this.readyState = 3
    service.leave(this.id)
    this.onclose?.()
  }
}

beforeEach(() => {
  setIdentity(null)
  sockets = []
  service = new CollabService((connectionId, message) => {
    sockets
      .find(socket => socket.id === connectionId)
      ?.onmessage?.({ data: JSON.stringify(message) })
  })
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { protocol: 'http:', host: 'localhost' }
  })
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: TestSocket })
})

afterEach(() => {
  stop?.()
  stop = undefined
  service.close()
  setIdentity(null)
  if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation)
  else Reflect.deleteProperty(globalThis, 'location')
  if (originalWebSocket) Object.defineProperty(globalThis, 'WebSocket', originalWebSocket)
  else Reflect.deleteProperty(globalThis, 'WebSocket')
})

test('runtime without an identity stays idle and never joins anonymously', () => {
  const client = new CollabClient('workspace')
  stop = client.start()
  client.store.setLocation({ page: 'view:board' })
  client.store.setPresence({
    registrationId: 'field',
    surface: 'board',
    channel: 'focus',
    value: 'title'
  })
  expect(sockets).toHaveLength(0)
  expect(getIdentity()).toBeNull()
  expect(client.store.getSnapshot().status).toBe('disconnected')
})

test('explicit identity enables workspace presence without an applet and clearing it disconnects', () => {
  const client = new CollabClient('workspace')
  stop = client.start()
  const identity = { id: 'alice', name: 'Alice', color: '#0f766e' }
  setIdentity(identity)
  expect(sockets).toHaveLength(1)
  const socket = sockets[0]!
  socket.open()
  expect(socket.sent[0]).toMatchObject({ type: 'join', identity })
  expect(client.store.getSnapshot().participants[0]?.userId).toEqual(identity.id)
  setIdentity({ ...identity, name: 'Alicia' })
  expect(socket.sent.at(-1)).toMatchObject({ type: 'identity', identity: { name: 'Alicia' } })
  expect(sockets).toHaveLength(1)
  setIdentity(null)
  expect(socket.readyState).toBe(3)
  expect(client.store.getSnapshot().status).toBe('disconnected')
})

test('reconnecting restores current presence and removed registrations stay gone', async () => {
  setIdentity({ id: 'alice', name: 'Alice', color: '#0f766e' })
  const client = new CollabClient('workspace')
  stop = client.start()
  sockets[0]!.open()
  client.store.setPresence({
    registrationId: 'kept',
    surface: 'board',
    channel: 'focus',
    value: true
  })
  client.store.setPresence({
    registrationId: 'removed',
    surface: 'board',
    channel: 'focus',
    value: true
  })
  client.store.deletePresence('removed')
  sockets[0]!.close()
  await Bun.sleep(550)
  sockets[1]!.open()
  await Bun.sleep(70)
  expect(sockets[1]!.sent.filter(message => message.type === 'presence:set')).toEqual([
    {
      type: 'presence:set',
      registrationId: 'kept',
      surface: 'board',
      channel: 'focus',
      value: true
    }
  ])
  expect(sockets[1]!.sent[0]).toMatchObject({ type: 'join', version: 2 })
})

test('changing user reconnects and never sends the host directory over the socket', async () => {
  setIdentity({ id: 'alice', name: 'Alice', color: '#0f766e' })
  const client = new CollabClient('workspace')
  stop = client.start()
  sockets[0]!.open()
  setIdentity({ id: 'bob', name: 'Bob', color: '#2563eb' })
  expect(sockets[0]!.readyState).toBe(3)
  await Bun.sleep(550)
  sockets[1]!.open()
  expect(sockets[1]!.sent[0]).toMatchObject({ type: 'join', identity: { id: 'bob' } })
  expect(sockets[1]!.sent.every(message => !('users' in message))).toBe(true)
})
