import { expect, test } from 'bun:test'
import type { Connection } from '@/lib/collab/types'
import {
  summarizeWorkspaceUsers,
  resolvePeers,
  resolveUser,
  userDisplayName,
  workspaceProfiles
} from './users'

const alice = { id: 'alice', name: 'Alice', color: '#0f766e' }
const bob = { id: 'bob', name: 'Bob', color: '#2563eb' }
const eve = { id: 'eve', name: 'Eve', color: '#2563eb' }
function connection(
  connectionId: string,
  userId: string,
  page: string | null,
  away = false
): Connection {
  return { connectionId, userId, location: page === null ? null : { page, away }, presence: [] }
}
const connections = [
  connection('self', 'alice', 'board'),
  connection('self-2', 'alice', 'board'),
  connection('b1', 'bob', 'board'),
  connection('b2', 'bob', null),
  connection('e1', 'eve', null)
]
const source = { connections, users: [alice, bob, eve] }

test('display names fall back to email or stable id without changing profile fields', () => {
  const nameless = {
    id: 'user-id',
    color: '#0f766e',
    name: '  ',
    email: '  user@example.test  '
  }
  expect(userDisplayName({ ...nameless, name: '  Named user  ' })).toBe('Named user')
  expect(userDisplayName(nameless)).toBe('user@example.test')
  expect(userDisplayName({ ...nameless, email: '  ' })).toBe('user-id')
  expect(userDisplayName({ id: 'only-id', color: '#0f766e' })).toBe('only-id')
  expect(nameless.name).toBe('  ')
  expect(nameless.email).toBe('  user@example.test  ')
})

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
  expect(resolveUser({ connections, users: profiles }, offline.id)).toEqual({
    ...offline,
    status: 'offline'
  })
  expect(resolveUser({ connections, users: profiles }, bob.id)).toBeNull()
  expect(workspaceProfiles([bob], alice, [])).toEqual([])
  expect(workspaceProfiles([bob], alice, null)).toEqual([bob, alice])
})

test('hidden tabs stay in their page peers and support the away filter', () => {
  const connections = [
    connection('self', 'alice', 'board'),
    connection('b1', 'bob', 'board', true),
    connection('b2', 'bob', 'notes', true),
    connection('e1', 'eve', 'notes', true)
  ]
  const source = { connections, users: [alice, bob, eve] }
  expect(resolvePeers(source, 'alice', { page: 'board' })).toEqual([{ ...bob, status: 'away' }])
  expect(resolvePeers(source, 'alice', { page: 'board' }, { status: 'away' })).toEqual([
    { ...bob, status: 'away' }
  ])
  expect(resolvePeers(source, 'alice', { page: 'board' }, { status: 'active' })).toEqual([])
  expect(
    summarizeWorkspaceUsers(connections, {
      currentUser: alice,
      connectionId: 'self',
      page: 'board',
      users: source.users
    }).find(user => user.profile.id === 'bob')
  ).toMatchObject({ pages: ['board', 'notes'], status: 'away' })
})

test('a visible connection makes the user active across their away page connections', () => {
  const connections = [connection('b1', 'bob', 'board', true), connection('b2', 'bob', 'notes')]
  const source = { connections, users: [bob] }
  expect(resolveUser(source, 'bob')?.status).toBe('active')
  expect(resolvePeers(source, 'alice', { page: 'board' }, { status: 'away' })).toEqual([])
  expect(resolvePeers(source, 'alice', { page: 'board' }, { status: 'active' })).toEqual([
    { ...bob, status: 'active' }
  ])
})

test.each(['__proto__', 'constructor', 'toString'])('%s resolves as an ordinary user id', id => {
  const user = { ...alice, id }
  expect(resolveUser({ connections: [], users: [user] }, user.id)).toEqual({
    ...user,
    status: 'offline'
  })
  expect(resolveUser({ connections: [], users: [] }, id)).toBeNull()
  expect(workspaceProfiles([{ ...user, name: 'Stale name' }, bob], user, null)).toEqual([user, bob])
})

test('header groups users, includes offline users, and merges visible browser tabs', () => {
  const users = [...source.users, { ...eve, id: 'offline' }]
  const result = summarizeWorkspaceUsers(connections, {
    currentUser: alice,
    connectionId: 'self',
    page: 'board',
    users
  })
  expect(result[0]).toMatchObject({ profile: alice, self: true, pages: ['board'] })
  expect(result[1]).toMatchObject({ profile: bob, pages: ['board'], status: 'active' })
  expect(result.at(-1)).toMatchObject({ pages: [], status: 'offline' })
})
