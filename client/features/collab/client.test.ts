import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'

import { colorForId } from '@/lib/collab/colors'
import { COLLAB_MAX_CONNECTIONS, isCollabClientMessage } from '@/lib/collab/protocol'
import type { CollabClientMessage } from '@/lib/collab/types'
import { CollabService } from '@/server/collab/service'

import { CollabClient, NO_ENGINE } from './client'
import { getCurrentUser, publishUsers } from './host-state'
import type { UserProfileInput } from './host-state'

const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
const originalWebSocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket')
let service: CollabService
let sockets: TestSocket[]
let stop: (() => void) | undefined

// Publish as an outer host would: one viewer, listed in the directory.
function signIn(user: UserProfileInput, others: readonly UserProfileInput[] = []) {
  publishUsers({ me: user.id, users: [user, ...others] })
}
function signOut() {
  publishUsers({ users: [] })
}

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
    try {
      service.receive(this.id, message)
    } catch (error) {
      // Match the worker: service failures arrive as messages on an open socket.
      this.onmessage?.({
        data: JSON.stringify({
          type: 'error',
          code: 'invalid_request',
          message: error instanceof Error ? error.message : 'Collab request failed'
        })
      })
    }
  }
  close() {
    this.readyState = 3
    service.leave(this.id)
    this.onclose?.()
  }
}

beforeEach(() => {
  signOut()
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
  signOut()
  if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation)
  else Reflect.deleteProperty(globalThis, 'location')
  if (originalWebSocket) Object.defineProperty(globalThis, 'WebSocket', originalWebSocket)
  else Reflect.deleteProperty(globalThis, 'WebSocket')
})

test('runtime without a current user stays idle and never joins anonymously', () => {
  const engine = new CollabClient('workspace')
  stop = engine.start()
  engine.setLocation({ page: 'views/board', status: 'active' })
  engine.setPresence({
    registrationId: 'field',
    appletId: 'views/board',
    channel: 'focus',
    value: 'title'
  })
  expect(sockets).toHaveLength(0)
  expect(getCurrentUser()).toBeUndefined()
  expect(engine.getSnapshot().status).toBe('disconnected')
})

test('an explicit user enables workspace presence without an applet and clearing it disconnects', () => {
  const engine = new CollabClient('workspace')
  stop = engine.start()
  const profile = { id: 'alice', name: 'Alice', color: 'emerald' } as const
  signIn(profile)
  expect(sockets).toHaveLength(1)
  const socket = sockets[0]!
  socket.open()
  expect(socket.sent[0]).toMatchObject({ type: 'join', profile })
  expect(engine.getSnapshot().connections[0]?.userId).toEqual(profile.id)
  signIn({ ...profile, name: 'Alicia' })
  expect(socket.sent.at(-1)).toMatchObject({ type: 'profile', profile: { name: 'Alicia' } })
  expect(sockets).toHaveLength(1)
  signOut()
  expect(socket.readyState).toBe(3)
  expect(engine.getSnapshot().status).toBe('disconnected')
})

test('two tabs send the same resolved color for a host user without one', () => {
  signIn({ id: 'alice' })
  const first = new CollabClient('workspace')
  const second = new CollabClient('workspace')
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
  signIn({ id: 'alice', name: 'Alice', color: 'emerald' })
  const engine = new CollabClient('workspace')
  stop = engine.start()
  sockets[0]!.open()
  engine.setPresence({
    registrationId: 'kept',
    appletId: 'views/board',
    channel: 'focus',
    value: true
  })
  engine.setPresence({
    registrationId: 'removed',
    appletId: 'views/board',
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
      appletId: 'views/board',
      channel: 'focus',
      value: true
    }
  ])
  expect(sockets[1]!.sent[0]).toMatchObject({ type: 'join', version: 1 })
})

test('a rejected join retries after capacity frees and cleanup cancels pending work', async () => {
  for (let index = 0; index < COLLAB_MAX_CONNECTIONS; index++) {
    service.receive(`occupied-${index}`, {
      type: 'join',
      version: 1,
      profile: { id: `occupied-${index}`, color: 'blue' }
    })
  }
  signIn({ id: 'alice', color: 'emerald' })
  const heartbeat = spyOn(globalThis, 'setInterval')
  const clearHeartbeat = spyOn(globalThis, 'clearInterval')
  const timer = spyOn(globalThis, 'setTimeout')
  const clearTimer = spyOn(globalThis, 'clearTimeout')
  try {
    const client = new CollabClient('workspace')
    stop = client.start()
    const rejected = sockets[0]!
    rejected.open()
    expect(rejected.readyState).toBe(3)
    expect(client.getSnapshot().status).toBe('disconnected')
    expect(clearHeartbeat).toHaveBeenCalledWith(heartbeat.mock.results.at(-1)!.value)

    service.leave('occupied-0')
    await Bun.sleep(550)
    expect(sockets).toHaveLength(2)
    const recovered = sockets[1]!
    recovered.open()
    expect(client.getSnapshot().status).toBe('connected')
    expect(recovered.sent[0]).toMatchObject({ type: 'join', profile: { id: 'alice' } })

    client.setPresence({
      registrationId: 'queued',
      appletId: 'views/board',
      channel: 'focus',
      value: true
    })
    const publicationTimer = timer.mock.results.at(-1)!.value
    stop()
    expect(clearTimer).toHaveBeenCalledWith(publicationTimer)
    expect(clearHeartbeat).toHaveBeenCalledWith(heartbeat.mock.results.at(-1)!.value)
    const sent = recovered.sent.length
    await Bun.sleep(550)
    expect(recovered.sent).toHaveLength(sent)
    expect(sockets).toHaveLength(2)

    stop = client.start()
    sockets[2]!.open()
    sockets[2]!.close()
    const retryTimer = timer.mock.results.at(-1)!.value
    stop()
    expect(clearTimer).toHaveBeenCalledWith(retryTimer)
    await Bun.sleep(550)
    expect(sockets).toHaveLength(3)
  } finally {
    stop?.()
    heartbeat.mockRestore()
    clearHeartbeat.mockRestore()
    timer.mockRestore()
    clearTimer.mockRestore()
  }
})

test('errors after joining keep the connection available for further presence', () => {
  signIn({ id: 'alice', color: 'emerald' })
  const client = new CollabClient('workspace')
  stop = client.start()
  const socket = sockets[0]!
  socket.open()
  socket.onmessage?.({
    data: JSON.stringify({ type: 'error', code: 'invalid_request', message: 'Rejected update' })
  })
  expect(socket.readyState).toBe(TestSocket.OPEN)
  expect(client.getSnapshot()).toMatchObject({ status: 'connected', error: 'Rejected update' })
  client.setLocation({ page: 'views/board', status: 'active' })
  expect(socket.sent.at(-1)).toEqual({
    type: 'location',
    location: { page: 'views/board', status: 'active' }
  })
})

test('profile edits publish immediately without changing the user id or reconnecting', () => {
  const alice = { id: 'alice', name: 'Alice', color: 'emerald' } as const
  signIn(alice)
  const engine = new CollabClient('workspace')
  stop = engine.start()
  sockets[0]!.open()
  const edited = { ...alice, name: 'Ada Lovelace', color: 'cyan' } as const
  signIn(edited)
  expect(sockets).toHaveLength(1)
  expect(sockets[0]!.readyState).toBe(TestSocket.OPEN)
  expect(sockets[0]!.sent.at(-1)).toEqual({ type: 'profile', profile: edited })
  expect(engine.getSnapshot().users).toEqual([edited])
})

test('a directory change that leaves the viewer alone sends nothing to the room', () => {
  const alice = { id: 'alice', name: 'Alice', color: 'emerald' } as const
  const bob = { id: 'bob', name: 'Bob', color: 'blue' } as const
  signIn(alice, [bob])
  const engine = new CollabClient('workspace')
  stop = engine.start()
  sockets[0]!.open()
  const sent = sockets[0]!.sent.length
  signIn(alice, [{ ...bob, name: 'Robert' }])
  expect(engine.getDirectory()).toEqual([alice, { ...bob, name: 'Robert' }])
  expect(sockets[0]!.sent).toHaveLength(sent)
  expect(sockets).toHaveLength(1)
})

test('changing user reconnects and never sends the host directory over the socket', async () => {
  signIn({ id: 'alice', name: 'Alice', color: 'emerald' })
  const engine = new CollabClient('workspace')
  stop = engine.start()
  sockets[0]!.open()
  signIn({ id: 'bob', name: 'Bob', color: 'blue' })
  expect(sockets[0]!.readyState).toBe(3)
  await Bun.sleep(550)
  sockets[1]!.open()
  expect(sockets[1]!.sent[0]).toMatchObject({ type: 'join', profile: { id: 'bob' } })
  expect(sockets[1]!.sent.every(message => !('users' in message))).toBe(true)
})

test('disabled engine exposes host profiles without starting a transport', () => {
  const alice = { id: 'alice', name: 'Alice', color: 'emerald' } as const
  const bob = { id: 'bob', name: 'Bob', color: 'blue' } as const
  signIn(alice)
  const engine = new CollabClient('workspace', false)
  stop = engine.start()
  expect(engine.enabled).toBe(false)
  expect(engine.workspaceId).toBe('workspace')
  expect(engine.getCurrentUser()).toEqual(alice)
  expect(engine.getDirectory()).toEqual([alice])
  let updates = 0
  const unsubscribe = engine.subscribeDirectory(() => updates++)
  signIn(alice, [bob])
  expect(engine.getDirectory()).toEqual([alice, bob])
  expect(updates).toBe(1)
  engine.setLocation({ page: 'overview', status: 'active' })
  engine.setPresence({
    registrationId: 'focus',
    appletId: 'views/board',
    channel: 'field:title',
    value: true
  })
  engine.deletePresence('focus')
  expect(sockets).toHaveLength(0)
  expect(engine.getSnapshot()).toMatchObject({ status: 'disconnected', connections: [] })
  expect(engine.getUsersSnapshot()).toBe(engine.getSnapshot())
  expect(engine.getPresenceSnapshot('views/board', 'field:title')).toEqual([])
  unsubscribe()
})

test('engine cleanup survives remounting and does not leave user listeners or retry sockets', async () => {
  const alice = { id: 'alice', name: 'Alice', color: 'emerald' } as const
  signIn(alice)
  const engine = new CollabClient('workspace')
  stop = engine.start()
  engine.start()()
  sockets[0]!.open()
  signIn({ ...alice, name: 'Alicia' })
  expect(sockets[0]!.sent.filter(message => message.type === 'profile')).toHaveLength(1)
  stop()
  signIn({ ...alice, name: 'Alice again' })
  await Bun.sleep(550)
  expect(sockets).toHaveLength(1)
  stop = engine.start()
  expect(sockets).toHaveLength(2)
  sockets[1]!.open()
  expect(engine.getSnapshot().status).toBe('connected')
})

test('the default engine keeps the viewer and directory readable while workspace operations stay inert', () => {
  const alice = { id: 'alice', name: 'Alice', color: 'emerald' } as const
  const bob = { id: 'bob', name: 'Bob', color: 'blue' } as const
  signIn(alice, [bob])
  expect(NO_ENGINE.getCurrentUser()).toEqual(alice)
  // The directory belongs to the app, not to a workspace, so it needs no engine.
  expect(NO_ENGINE.getDirectory()).toEqual([alice, bob])
  let updates = 0
  const unsubscribe = NO_ENGINE.subscribeDirectory(() => updates++)
  signIn(alice)
  unsubscribe()
  expect([NO_ENGINE.getDirectory(), updates]).toEqual([[alice], 1])
  expect(NO_ENGINE.getPresenceSnapshot('one', 'field')).toBe(
    NO_ENGINE.getPresenceSnapshot('two', 'cursor')
  )
  NO_ENGINE.start()()
  NO_ENGINE.setLocation({ page: 'overview', status: 'active' })
  expect(sockets).toHaveLength(0)
})
