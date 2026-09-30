import { expect, test } from 'bun:test'
import type { CollabClientMessage, Connection } from '@/lib/collab/types'
import { CollabStore } from './store'

const alice = { id: 'alice', name: 'Alice', color: 'emerald' } as const
const connection: Connection = {
  connectionId: 'a',
  userId: 'alice',
  location: { page: 'overview' },
  presence: []
}
const welcome = {
  type: 'welcome' as const,
  version: 1 as const,
  connectionId: 'a',
  connections: [connection],
  users: [alice]
}
const field = {
  registrationId: 'field',
  surface: 'view:board',
  channel: 'field:title',
  value: true
}

test('reading and subscribing never publishes presence', () => {
  const store = new CollabStore()
  const sent: CollabClientMessage[] = []
  store.setSender(message => sent.push(message))
  store.receive(welcome)
  const unsubscribe = store.subscribe(() => {})
  expect(store.getSnapshot().users).toEqual([alice])
  unsubscribe()
  expect(sent).toEqual([])
})

test('presence cleanup removes only its own registration and reconnect republishes surviving owners', () => {
  const store = new CollabStore()
  const sent: CollabClientMessage[] = []
  store.setSender(message => sent.push(message))
  store.receive(welcome)
  store.setPresence(field)
  store.setPresence({ ...field, registrationId: 'second' })
  store.deletePresence('field')
  store.disconnect()
  expect(store.getSnapshot()).toMatchObject({ connections: [], users: [], connectionId: null })
  sent.length = 0
  store.receive({ ...welcome, connectionId: 'reconnected' })
  expect(sent).toEqual([{ type: 'presence:set', ...field, registrationId: 'second' }])
})

test('live profile snapshots replace stale profiles instead of remembering disconnected users', () => {
  const store = new CollabStore()
  store.receive(welcome)
  store.receive({ type: 'connections', connections: [], users: [] })
  expect(store.getSnapshot().users).toEqual([])
})

test('location changes notify page observers immediately and identical presence does not republish', () => {
  const store = new CollabStore()
  const sent: CollabClientMessage[] = []
  store.setSender(message => sent.push(message))
  store.receive(welcome)
  let notifications = 0
  store.subscribe(() => notifications++)
  store.setLocation({ page: 'view:board' })
  expect(notifications).toBe(1)
  expect(store.getLocation()).toEqual({ page: 'view:board' })
  store.setPresence(field)
  store.setPresence({ ...field })
  expect(sent.filter(message => message.type === 'presence:set')).toHaveLength(1)
})

const bob = { id: 'bob', name: 'Bob', color: 'blue' } as const
const remote: Connection = {
  connectionId: 'b',
  userId: 'bob',
  location: { page: 'overview' },
  presence: [
    field,
    { ...field, registrationId: 'cursor', channel: 'cursor:board', value: { x: 1, y: 2 } }
  ]
}

test('cursor movement preserves the users and unrelated channel snapshots by reference', () => {
  const store = new CollabStore()
  store.setLocation({ page: 'overview' })
  store.receive({ ...welcome, connections: [connection, remote], users: [alice, bob] })
  const users = store.getUsersSnapshot()
  const title = store.getPresenceSnapshot('view:board', 'field:title')
  const cursor = store.getPresenceSnapshot('view:board', 'cursor:board')
  const absent = store.getPresenceSnapshot('view:board', 'custom:absent')
  store.receive({
    type: 'connections',
    users: structuredClone([alice, bob]),
    connections: [
      connection,
      {
        ...remote,
        presence: [field, { ...remote.presence[1]!, value: { x: 20, y: 40 } }]
      }
    ]
  })
  expect(store.getUsersSnapshot()).toBe(users)
  expect(store.getUsersSnapshot().connections.every(peer => peer.presence.length === 0)).toBe(true)
  expect(store.getPresenceSnapshot('view:board', 'field:title')).toBe(title)
  expect(store.getPresenceSnapshot('view:board', 'custom:absent')).toBe(absent)
  expect(store.getPresenceSnapshot('view:board', 'cursor:board')).not.toBe(cursor)
  expect(store.getPresenceSnapshot('view:board', 'cursor:board')[0]?.value).toEqual({
    x: 20,
    y: 40
  })
})

test('presence selectors respond immediately to page and visibility changes, filtering other connections', () => {
  const store = new CollabStore()
  store.setLocation({ page: 'overview' })
  store.receive({
    ...welcome,
    connections: [{ ...connection, presence: [field] }, remote],
    users: [alice, bob]
  })
  const getTitle = () => store.getPresenceSnapshot('view:board', 'field:title')
  expect(getTitle().map(entry => entry.connectionId)).toEqual(['b'])
  const users = store.getUsersSnapshot()
  store.setLocation({ page: 'view:other' })
  expect(getTitle()).toEqual([])
  expect(store.getUsersSnapshot()).not.toBe(users)
  store.setLocation({ page: 'overview', away: true })
  expect(getTitle()).toEqual([])
  store.setLocation({ page: 'overview' })
  expect(getTitle()).toHaveLength(1)
  store.receive({
    type: 'connections',
    connections: [{ ...remote, location: { page: 'overview', away: true } }],
    users: [bob]
  })
  expect(getTitle()).toEqual([])
  store.receive({ type: 'connections', connections: [remote], users: [bob] })
  expect(getTitle()).toHaveLength(1)
  store.disconnect()
  expect(getTitle()).toEqual([])
})

test('profile and status changes advance users snapshots without republishing unchanged presence', () => {
  const store = new CollabStore()
  store.setLocation({ page: 'overview' })
  store.receive({ ...welcome, connections: [connection, remote], users: [alice, bob] })
  const users = store.getUsersSnapshot()
  const title = store.getPresenceSnapshot('view:board', 'field:title')
  store.receive({
    type: 'connections',
    connections: [connection, remote],
    users: [alice, { ...bob, name: 'Robert' }]
  })
  expect(store.getUsersSnapshot()).not.toBe(users)
  expect(store.getUsersSnapshot().users[1]?.name).toBe('Robert')
  expect(store.getPresenceSnapshot('view:board', 'field:title')).toBe(title)
})
