import { expect, test } from 'bun:test'
import { createFakeEngine } from '@/client/features/collab/testing/fake-engine'
import { connectPlaygroundParticipants } from './playground-room'

test('participants exchange real publications, clear them, and stop relaying on cleanup', () => {
  const users = [
    { id: 'you', name: 'You', color: 'violet' as const },
    { id: 'fig', name: 'Fig', color: 'amber' as const }
  ]
  const rooms = users.map(self => createFakeEngine({ self, users, page: 'playground' }))
  const [you, fig] = rooms
  const dispose = connectPlaygroundParticipants(rooms)
  const registration = { registrationId: 'field', appletId: 'demo', channel: 'focus', value: true }
  you!.setPresence(registration)
  expect(fig!.getPresenceSnapshot('demo', 'focus')).toEqual([
    { registrationId: 'field', connectionId: 'preview:you', userId: 'you', value: true }
  ])
  // Identical local connection/registration IDs in different engines stay separate.
  fig!.setPresence({ ...registration, value: 'Fig' })
  expect(you!.getPresenceSnapshot('demo', 'focus')).toEqual([
    { registrationId: 'field', connectionId: 'preview:fig', userId: 'fig', value: 'Fig' }
  ])
  you!.deletePresence('field')
  expect(fig!.getPresenceSnapshot('demo', 'focus')).toEqual([])
  fig!.setLocation({ page: 'elsewhere', status: 'active' })
  expect(
    you!.getSnapshot().connections.find(connection => connection.userId === 'fig')?.location?.page
  ).toBe('elsewhere')
  dispose()
  you!.setPresence(registration)
  expect(fig!.getPresenceSnapshot('demo', 'focus')).toEqual([])
})
