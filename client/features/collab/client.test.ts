import { afterEach, beforeEach, expect, test } from 'bun:test'

import { isCollabClientMessage } from '@/lib/collab/protocol'
import type { CollabClientMessage } from '@/lib/collab/types'
import { CollabService } from '@/server/collab/service'
import { openCollabStorage } from '@/server/collab/storage'

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
  service = new CollabService(openCollabStorage(':memory:'), (connectionId, message) => {
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

test('runtime starts idle without assigning an identity; a shared-state applet connects anonymously', async () => {
  const client = new CollabClient('workspace')
  stop = client.start()
  expect(sockets).toHaveLength(0)
  expect(getIdentity()).toBeNull()
  client.store.setLocation({ page: 'view:board' })
  client.store.setPresence({
    registrationId: 'field',
    surface: 'board',
    channel: 'focus',
    value: 'title'
  })
  const releaseScope = client.store.acquireScope('board')
  const releaseConnection = client.acquireSharedState()
  expect(sockets).toHaveLength(1)
  const socket = sockets[0]!
  socket.open()
  expect(socket.sent[0]).toMatchObject({ type: 'join', identity: null })
  expect(client.store.getSnapshot()).toMatchObject({ status: 'connected', participants: [] })
  expect(client.store.getScopeSnapshot('board').loaded).toBe(true)
  expect(
    socket.sent.some(message => message.type === 'presence:set' || message.type === 'location')
  ).toBe(false)
  const outcome = await client.store.mutate('board', [
    { type: 'set', key: 'title', value: 'Anonymous storage' }
  ])
  expect(outcome.status).toBe('committed')
  expect(client.store.getScopeSnapshot('board').entries.title).toBe('Anonymous storage')
  expect(getIdentity()).toBeNull()
  releaseScope()
  releaseConnection()
  expect(socket.readyState).toBe(3)
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
  expect(client.store.getSnapshot().participants[0]?.identity).toEqual(identity)
  setIdentity({ ...identity, name: 'Alicia' })
  expect(socket.sent.at(-1)).toMatchObject({ type: 'identity', identity: { name: 'Alicia' } })
  expect(sockets).toHaveLength(1)
  setIdentity(null)
  expect(socket.readyState).toBe(3)
  expect(client.store.getSnapshot().status).toBe('disconnected')
})
