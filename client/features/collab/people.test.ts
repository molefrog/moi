import { expect, test } from 'bun:test'
import type { CollabParticipant } from '@/lib/collab/types'
import { groupPeople, resolvePeers, resolveUser, workspaceProfiles } from './people'

const alice = { id: 'alice', name: 'Alice', color: '#0f766e' }
const bob = { id: 'bob', name: 'Bob', color: '#2563eb' }
const eve = { id: 'eve', name: 'Eve', color: '#2563eb' }
function connection(
  connectionId: string,
  userId: string,
  page: string | null,
  away = false
): CollabParticipant {
  return { connectionId, userId, location: page === null ? null : { page, away }, presence: [] }
}
const participants = [
  connection('self', 'alice', 'board'),
  connection('self-2', 'alice', 'board'),
  connection('b1', 'bob', 'board'),
  connection('b2', 'bob', null),
  connection('e1', 'eve', null)
]
const source = { participants, users: [alice, bob, eve] }

test('peers are other users, deduplicated across tabs, with page/workspace and status filters', () => {
  expect(resolvePeers(source, 'alice', { page: 'board' })).toEqual([{ ...bob, status: 'active' }])
  expect(resolvePeers(source, 'alice', { page: 'board' }, { scope: 'workspace' })).toEqual([
    { ...bob, status: 'active' },
    { ...eve, status: 'away' }
  ])
  expect(resolvePeers(source, 'alice', null)).toEqual([])
  expect(resolvePeers(source, 'alice', null, { scope: 'workspace', status: 'away' })).toEqual([
    { ...eve, status: 'away' }
  ])
})

test('host directory resolves offline users and removals remain authoritative over live profiles', () => {
  const offline = {
    id: 'offline',
    name: 'Offline user',
    color: '#0f766e',
    email: 'user@example.test'
  }
  const profiles = workspaceProfiles([alice, bob], alice, [offline])
  expect(resolveUser({ participants, users: profiles }, offline.id)).toEqual({
    ...offline,
    status: 'offline'
  })
  expect(resolveUser({ participants, users: profiles }, bob.id)).toBeNull()
  expect(workspaceProfiles([bob], alice, [])).toEqual([])
  expect(workspaceProfiles([bob], alice, null)).toEqual([bob, alice])
})

test('hidden tabs stay in their page peers and support the away filter', () => {
  const participants = [
    connection('self', 'alice', 'board'),
    connection('b1', 'bob', 'board', true),
    connection('b2', 'bob', 'notes', true),
    connection('e1', 'eve', 'notes', true)
  ]
  const source = { participants, users: [alice, bob, eve] }
  expect(resolvePeers(source, 'alice', { page: 'board' })).toEqual([{ ...bob, status: 'away' }])
  expect(resolvePeers(source, 'alice', { page: 'board' }, { status: 'away' })).toEqual([
    { ...bob, status: 'away' }
  ])
  expect(resolvePeers(source, 'alice', { page: 'board' }, { status: 'active' })).toEqual([])
  expect(
    groupPeople(participants, {
      identity: alice,
      connectionId: 'self',
      page: 'board',
      users: source.users
    }).find(person => person.identity.id === 'bob')
  ).toMatchObject({ pages: ['board', 'notes'], status: 'away' })
})

test('a visible connection makes the user active across their away page connections', () => {
  const participants = [connection('b1', 'bob', 'board', true), connection('b2', 'bob', 'notes')]
  const source = { participants, users: [bob] }
  expect(resolveUser(source, 'bob')?.status).toBe('active')
  expect(resolvePeers(source, 'alice', { page: 'board' }, { status: 'away' })).toEqual([])
  expect(resolvePeers(source, 'alice', { page: 'board' }, { status: 'active' })).toEqual([
    { ...bob, status: 'active' }
  ])
})

test('prototype-like ids resolve as ordinary user ids', () => {
  const user = { ...alice, id: '__proto__' }
  expect(resolveUser({ participants: [], users: [user] }, user.id)).toEqual({
    ...user,
    status: 'offline'
  })
  expect(resolveUser({ participants: [], users: [] }, 'constructor')).toBeNull()
})

test('header groups users, includes offline users, and merges visible browser tabs', () => {
  const users = [...source.users, { ...eve, id: 'offline' }]
  const result = groupPeople(participants, {
    identity: alice,
    connectionId: 'self',
    page: 'board',
    users
  })
  expect(result[0]).toMatchObject({ identity: alice, self: true, pages: ['board'] })
  expect(result[1]).toMatchObject({ identity: bob, pages: ['board'], status: 'active' })
  expect(result.at(-1)).toMatchObject({ pages: [], status: 'offline' })
})
