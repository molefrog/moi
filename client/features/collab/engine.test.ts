import { afterEach, beforeEach, expect, test } from 'bun:test'

import { colorForId } from '@/lib/collab/colors'
import { isCollabClientMessage } from '@/lib/collab/protocol'
import type { CollabClientMessage } from '@/lib/collab/types'
import { CollabService } from '@/server/collab/service'

import { CollabEngine, NO_ENGINE } from './engine'
import { getCurrentUser, setHostState, setCurrentUser } from './host-state'

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
  setCurrentUser(undefined)
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
  setCurrentUser(undefined)
  if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation)
  else Reflect.deleteProperty(globalThis, 'location')
  if (originalWebSocket) Object.defineProperty(globalThis, 'WebSocket', originalWebSocket)
  else Reflect.deleteProperty(globalThis, 'WebSocket')
})

test('runtime without a current user stays idle and never joins anonymously', () => {
  const engine = new CollabEngine('workspace')
  stop = engine.start()
  engine.setLocation({ page: 'view:board', status: 'active' })
  engine.setPresence({
    registrationId: 'field',
    surface: 'board',
    channel: 'focus',
    value: 'title'
  })
  expect(sockets).toHaveLength(0)
  expect(getCurrentUser()).toBeUndefined()
  expect(engine.getSnapshot().status).toBe('disconnected')
})

test('an explicit user enables workspace presence without an applet and clearing it disconnects', () => {
  const engine = new CollabEngine('workspace')
  stop = engine.start()
  const profile = { id: 'alice', name: 'Alice', color: 'emerald' } as const
  setCurrentUser(profile)
  expect(sockets).toHaveLength(1)
  const socket = sockets[0]!
  socket.open()
  expect(socket.sent[0]).toMatchObject({ type: 'join', profile })
  expect(engine.getSnapshot().connections[0]?.userId).toEqual(profile.id)
  setCurrentUser({ ...profile, name: 'Alicia' })
  expect(socket.sent.at(-1)).toMatchObject({ type: 'profile', profile: { name: 'Alicia' } })
  expect(sockets).toHaveLength(1)
  setCurrentUser(undefined)
  expect(socket.readyState).toBe(3)
  expect(engine.getSnapshot().status).toBe('disconnected')
})

test('two tabs send the same resolved color for a host user without one', () => {
  setHostState({ currentUser: { id: 'alice' }, workspaces: {} })
  const first = new CollabEngine('workspace')
  const second = new CollabEngine('workspace')
  stop = first.start()
  const stopSecond = second.start()
  try {
    expect(sockets).toHaveLength(2)
    sockets.forEach(socket => socket.open())
    for (const socket of sockets) {
      expect(socket.sent[0]).toMatchObject({
        type: 'join',
        profile: { id: 'alice', color: colorForId('alice') }
      })
    }
  } finally {
    stopSecond()
  }
})

test('reconnecting restores current presence and removed registrations stay gone', async () => {
  setCurrentUser({ id: 'alice', name: 'Alice', color: 'emerald' })
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
  expect(sockets[1]!.sent[0]).toMatchObject({ type: 'join', version: 1 })
})

test('changing user reconnects and never sends the host directory over the socket', async () => {
  setCurrentUser({ id: 'alice', name: 'Alice', color: 'emerald' })
  const engine = new CollabEngine('workspace')
  stop = engine.start()
  sockets[0]!.open()
  setCurrentUser({ id: 'bob', name: 'Bob', color: 'blue' })
  expect(sockets[0]!.readyState).toBe(3)
  await Bun.sleep(550)
  sockets[1]!.open()
  expect(sockets[1]!.sent[0]).toMatchObject({ type: 'join', profile: { id: 'bob' } })
  expect(sockets[1]!.sent.every(message => !('users' in message))).toBe(true)
})

test('disabled engine exposes host profiles and readiness without starting a transport', () => {
  const alice = { id: 'alice', name: 'Alice', color: 'emerald' } as const
  setHostState({
    currentUser: alice,
    workspaces: { workspace: { status: 'loading' } }
  })
  const engine = new CollabEngine('workspace', false)
  stop = engine.start()
  expect(engine.enabled).toBe(false)
  expect(engine.workspaceId).toBe('workspace')
  expect(engine.getCurrentUser()).toEqual(alice)
  expect(engine.getWorkspaceDirectory()).toEqual({ status: 'loading', users: [] })
  let updates = 0
  const unsubscribe = engine.subscribeWorkspaceUsers(() => updates++)
  setHostState({
    currentUser: alice,
    workspaces: { workspace: { status: 'ready', users: [alice] } }
  })
  expect(engine.getWorkspaceDirectory()).toEqual({ status: 'ready', users: [alice] })
  expect(engine.getWorkspaceUsers()).toEqual([alice])
  expect(updates).toBe(1)
  engine.setLocation({ page: 'overview', status: 'active' })
  engine.setPresence({
    registrationId: 'focus',
    surface: 'view:board',
    channel: 'field:title',
    value: true
  })
  engine.deletePresence('focus')
  expect(sockets).toHaveLength(0)
  expect(engine.getSnapshot()).toMatchObject({ status: 'disconnected', connections: [] })
  expect(engine.getUsersSnapshot()).toBe(engine.getSnapshot())
  expect(engine.getPresenceSnapshot('view:board', 'field:title')).toEqual([])
  unsubscribe()
})

test('engine cleanup survives remounting and does not leave user listeners or retry sockets', async () => {
  const alice = { id: 'alice', name: 'Alice', color: 'emerald' } as const
  setCurrentUser(alice)
  const engine = new CollabEngine('workspace')
  stop = engine.start()
  engine.start()()
  sockets[0]!.open()
  setCurrentUser({ ...alice, name: 'Alicia' })
  expect(sockets[0]!.sent.filter(message => message.type === 'profile')).toHaveLength(1)
  stop()
  setCurrentUser({ ...alice, name: 'Alice again' })
  await Bun.sleep(550)
  expect(sockets).toHaveLength(1)
  stop = engine.start()
  expect(sockets).toHaveLength(2)
  sockets[1]!.open()
  expect(engine.getSnapshot().status).toBe('connected')
})

test('the default engine keeps the current user readable while workspace operations stay inert', () => {
  const alice = { id: 'alice', name: 'Alice', color: 'emerald' } as const
  setCurrentUser(alice)
  expect(NO_ENGINE.getCurrentUser()).toEqual(alice)
  expect(NO_ENGINE.getWorkspaceDirectory()).toEqual({ status: 'unavailable', users: [] })
  expect(NO_ENGINE.getWorkspaceDirectory()).toBe(NO_ENGINE.getWorkspaceDirectory())
  expect(NO_ENGINE.getWorkspaceUsers()).toBeNull()
  expect(NO_ENGINE.getPresenceSnapshot('one', 'field')).toBe(
    NO_ENGINE.getPresenceSnapshot('two', 'cursor')
  )
  NO_ENGINE.start()()
  NO_ENGINE.setLocation({ page: 'overview', status: 'active' })
  expect(sockets).toHaveLength(0)
})
