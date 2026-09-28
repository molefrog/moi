import { expect, test } from 'bun:test'
import { createFakeEngine } from './fake-engine'

const alice = { id: 'alice', name: 'Alice', color: '#0f766e' }
const bob = { id: 'bob', name: 'Bob', color: '#2563eb' }
const field = {
  registrationId: 'field',
  surface: 'view:board',
  channel: 'field:title',
  value: true
}

test('fixture directory includes offline users while live state contains only connections', () => {
  const room = createFakeEngine({ self: alice, users: [alice, bob] })
  expect(room.getSnapshot().connections[0]?.userId).toBe('alice')
  expect(room.getSnapshot().users).toEqual([alice])
  expect(room.getWorkspaceUsers()).toEqual([alice, bob])
})

test('presence publication and deletion belong to the caller and other connections can be replaced', () => {
  const room = createFakeEngine({ self: alice, users: [alice, bob] })
  room.setPresence(field)
  expect(room.getSnapshot().connections[0]?.presence).toEqual([field])
  room.deletePresence(field.registrationId)
  expect(room.getSnapshot().connections[0]?.presence).toEqual([])
  room.setOtherConnections([{ connectionId: 'b', userId: 'bob', location: null, presence: [] }])
  expect(room.getSnapshot().connections).toHaveLength(2)
})

test('directory replacement notifies observers without retaining removed users', () => {
  const room = createFakeEngine({ self: alice, users: [alice, bob] })
  let notifications = 0
  room.subscribeWorkspaceUsers(() => notifications++)
  room.setUsers([bob])
  expect(room.getWorkspaceUsers()).toEqual([bob])
  room.setUsers([])
  expect(room.getWorkspaceUsers()).toEqual([])
  room.setUsers(null)
  expect(room.getWorkspaceUsers()).toBeNull()
  expect(notifications).toBe(3)
})

test('reactive inline JSON values do not feed publication back into an endless render loop', () => {
  const room = createFakeEngine({ self: alice, users: [alice] })
  let notifications = 0
  room.subscribe(() => {
    notifications++
    if (notifications > 3) throw new Error('Equivalent presence kept republishing')
    room.setPresence({ ...field, value: { target: 'title', selection: [1, 2] } })
  })
  room.setPresence({ ...field, value: { target: 'title', selection: [1, 2] } })
  expect(notifications).toBe(1)
  expect(room.getSnapshot().connections[0]?.presence).toHaveLength(1)
})

test('loading fixtures expose no directory until the complete ready snapshot arrives', () => {
  const room = createFakeEngine({ self: alice, users: [alice, bob], directoryStatus: 'loading' })
  const loading = room.getWorkspaceDirectory()
  expect(loading).toEqual({ status: 'loading', users: [] })
  expect(room.getWorkspaceUsers()).toEqual([])
  expect(room.getWorkspaceDirectory()).toBe(loading)
  room.setDirectoryStatus('ready')
  expect(room.getWorkspaceDirectory()).toEqual({ status: 'ready', users: [alice, bob] })
  expect(room.getWorkspaceUsers()).toBe(room.getWorkspaceDirectory().users)
  room.setUsers([])
  expect(room.getWorkspaceDirectory()).toEqual({ status: 'ready', users: [] })
})

test('fake updates share the live engine selection rules and stable snapshots', () => {
  const connection = {
    connectionId: 'b',
    userId: 'bob',
    location: { page: 'preview' },
    presence: [field]
  }
  const room = createFakeEngine({
    self: alice,
    users: [alice, bob],
    otherConnections: [connection]
  })
  const users = room.getUsersSnapshot()
  const title = room.getPresenceSnapshot('view:board', 'field:title')
  room.setOtherConnections([
    {
      ...connection,
      presence: [
        field,
        { ...field, registrationId: 'cursor', channel: 'cursor:board', value: { x: 4, y: 8 } }
      ]
    }
  ])
  expect(room.getUsersSnapshot()).toBe(users)
  expect(room.getPresenceSnapshot('view:board', 'field:title')).toBe(title)
  room.setLocation({ page: 'preview', away: true })
  expect(room.getLocation()).toEqual({ page: 'preview', away: true })
  expect(room.getPresenceSnapshot('view:board', 'field:title')).toEqual([])
  room.setLocation({ page: 'preview' })
  expect(room.getPresenceSnapshot('view:board', 'field:title')).toHaveLength(1)
})
