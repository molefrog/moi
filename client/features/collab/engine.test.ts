import { afterEach, beforeEach, expect, test } from 'bun:test'

import { isCollabClientMessage } from '@/lib/collab/protocol'
import type { CollabClientMessage } from '@/lib/collab/types'
import { CollabService } from '@/server/collab/service'

import { CollabEngine, NO_ENGINE } from './engine'
import { getIdentity, setHostState, setIdentity } from './identity'

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
  const engine = new CollabEngine('workspace')
  stop = engine.start()
  engine.setLocation({ page: 'view:board' })
  engine.setPresence({
    registrationId: 'field',
    surface: 'board',
    channel: 'focus',
    value: 'title'
  })
  expect(sockets).toHaveLength(0)
  expect(getIdentity()).toBeNull()
  expect(engine.getSnapshot().status).toBe('disconnected')
})

test('explicit identity enables workspace presence without an applet and clearing it disconnects', () => {
  const engine = new CollabEngine('workspace')
  stop = engine.start()
  const identity = { id: 'alice', name: 'Alice', color: '#0f766e' }
  setIdentity(identity)
  expect(sockets).toHaveLength(1)
  const socket = sockets[0]!
  socket.open()
  expect(socket.sent[0]).toMatchObject({ type: 'join', identity })
  expect(engine.getSnapshot().participants[0]?.userId).toEqual(identity.id)
  setIdentity({ ...identity, name: 'Alicia' })
  expect(socket.sent.at(-1)).toMatchObject({ type: 'identity', identity: { name: 'Alicia' } })
  expect(sockets).toHaveLength(1)
  setIdentity(null)
  expect(socket.readyState).toBe(3)
  expect(engine.getSnapshot().status).toBe('disconnected')
})

test('reconnecting restores current presence and removed registrations stay gone', async () => {
  setIdentity({ id: 'alice', name: 'Alice', color: '#0f766e' })
  const engine = new CollabEngine('workspace')
  stop = engine.start()
  sockets[0]!.open()
  engine.setPresence({
    registrationId: 'kept',
    surface: 'board',
    channel: 'focus',
    value: true
  })
  engine.setPresence({
    registrationId: 'removed',
    surface: 'board',
    channel: 'focus',
    value: true
  })
  engine.deletePresence('removed')
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
  const engine = new CollabEngine('workspace')
  stop = engine.start()
  sockets[0]!.open()
  setIdentity({ id: 'bob', name: 'Bob', color: '#2563eb' })
  expect(sockets[0]!.readyState).toBe(3)
  await Bun.sleep(550)
  sockets[1]!.open()
  expect(sockets[1]!.sent[0]).toMatchObject({ type: 'join', identity: { id: 'bob' } })
  expect(sockets[1]!.sent.every(message => !('users' in message))).toBe(true)
})

test('disabled engine exposes host profiles and readiness without starting a transport', () => {
  const alice = { id: 'alice', name: 'Alice', color: '#0f766e' }
  setHostState({
    identity: alice,
    workspaces: { workspace: { status: 'loading' } }
  })
  const engine = new CollabEngine('workspace', false)
  stop = engine.start()
  expect(engine.enabled).toBe(false)
  expect(engine.workspaceId).toBe('workspace')
  expect(engine.getIdentity()).toEqual(alice)
  expect(engine.getWorkspaceDirectory()).toEqual({ status: 'loading', users: [] })
  let updates = 0
  const unsubscribe = engine.subscribeWorkspaceUsers(() => updates++)
  setHostState({
    identity: alice,
    workspaces: { workspace: { status: 'ready', users: [alice] } }
  })
  expect(engine.getWorkspaceDirectory()).toEqual({ status: 'ready', users: [alice] })
  expect(engine.getWorkspaceUsers()).toEqual([alice])
  expect(updates).toBe(1)
  engine.setLocation({ page: 'overview' })
  engine.setPresence({
    registrationId: 'focus',
    surface: 'view:board',
    channel: 'field:title',
    value: true
  })
  engine.deletePresence('focus')
  expect(sockets).toHaveLength(0)
  expect(engine.getSnapshot()).toMatchObject({ status: 'disconnected', participants: [] })
  expect(engine.getPeopleSnapshot()).toBe(engine.getSnapshot())
  expect(engine.getPresenceSnapshot('view:board', 'field:title')).toEqual([])
  unsubscribe()
})

test('engine cleanup survives remounting and does not leave identity listeners or retry sockets', async () => {
  const alice = { id: 'alice', name: 'Alice', color: '#0f766e' }
  setIdentity(alice)
  const engine = new CollabEngine('workspace')
  stop = engine.start()
  engine.start()()
  sockets[0]!.open()
  setIdentity({ ...alice, name: 'Alicia' })
  expect(sockets[0]!.sent.filter(message => message.type === 'identity')).toHaveLength(1)
  stop()
  setIdentity({ ...alice, name: 'Alice again' })
  await Bun.sleep(550)
  expect(sockets).toHaveLength(1)
  stop = engine.start()
  expect(sockets).toHaveLength(2)
  sockets[1]!.open()
  expect(engine.getSnapshot().status).toBe('connected')
})

test('the default engine keeps identity readable while every workspace operation stays inert', () => {
  const alice = { id: 'alice', name: 'Alice', color: '#0f766e' }
  setIdentity(alice)
  expect(NO_ENGINE.getIdentity()).toEqual(alice)
  expect(NO_ENGINE.getWorkspaceDirectory()).toEqual({ status: 'unavailable', users: [] })
  expect(NO_ENGINE.getWorkspaceDirectory()).toBe(NO_ENGINE.getWorkspaceDirectory())
  expect(NO_ENGINE.getWorkspaceUsers()).toBeNull()
  expect(NO_ENGINE.getPresenceSnapshot('one', 'field')).toBe(
    NO_ENGINE.getPresenceSnapshot('two', 'cursor')
  )
  NO_ENGINE.start()()
  NO_ENGINE.setLocation({ page: 'overview' })
  expect(sockets).toHaveLength(0)
})
