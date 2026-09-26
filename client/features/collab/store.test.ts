import { expect, test } from 'bun:test'
import type { CollabClientMessage, CollabParticipant } from '@/lib/collab/types'
import { CollabStore } from './store'

const alice = { id: 'alice', name: 'Alice', color: '#0f766e' }
const participant: CollabParticipant = {
  connectionId: 'a',
  userId: 'alice',
  location: { page: 'overview' },
  presence: []
}
const welcome = {
  type: 'welcome' as const,
  version: 2 as const,
  connectionId: 'a',
  participants: [participant],
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
  expect(store.getSnapshot()).toMatchObject({ participants: [], users: [], connectionId: null })
  sent.length = 0
  store.receive({ ...welcome, connectionId: 'reconnected' })
  expect(sent).toEqual([{ type: 'presence:set', ...field, registrationId: 'second' }])
})

test('live profile snapshots replace stale profiles instead of remembering disconnected users', () => {
  const store = new CollabStore()
  store.receive(welcome)
  store.receive({ type: 'participants', participants: [], users: [] })
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
