import { expect, test } from 'bun:test'
import { createFakeBackend } from './fake-backend'

const alice = { id: 'alice', name: 'Alice', color: '#0f766e' }
const bob = { id: 'bob', name: 'Bob', color: '#2563eb' }
const field = {
  registrationId: 'field',
  surface: 'view:board',
  channel: 'field:title',
  value: true
}

test('fixture directory includes offline users while live state contains only connections', () => {
  const room = createFakeBackend({ self: alice, users: [alice, bob] })
  expect(room.getSnapshot().participants[0]?.userId).toBe('alice')
  expect(room.getSnapshot().users).toEqual([alice])
  expect(room.getWorkspaceUsers()).toEqual([alice, bob])
})

test('presence publication and deletion belong to the caller and others can be replaced', () => {
  const room = createFakeBackend({ self: alice, users: [alice, bob] })
  room.setPresence(field)
  expect(room.getSnapshot().participants[0]?.presence).toEqual([field])
  room.deletePresence(field.registrationId)
  expect(room.getSnapshot().participants[0]?.presence).toEqual([])
  room.setOthers([{ connectionId: 'b', userId: 'bob', location: null, presence: [] }])
  expect(room.getSnapshot().participants).toHaveLength(2)
})

test('directory replacement notifies observers without retaining removed users', () => {
  const room = createFakeBackend({ self: alice, users: [alice, bob] })
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
  const room = createFakeBackend({ self: alice, users: [alice] })
  let notifications = 0
  room.subscribe(() => {
    notifications++
    if (notifications > 3) throw new Error('Equivalent presence kept republishing')
    room.setPresence({ ...field, value: { target: 'title', selection: [1, 2] } })
  })
  room.setPresence({ ...field, value: { target: 'title', selection: [1, 2] } })
  expect(notifications).toBe(1)
  expect(room.getSnapshot().participants[0]?.presence).toHaveLength(1)
})
