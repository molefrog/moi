import { userDisplayName } from '@/client/lib/user-display-name'
import { expect, test } from 'bun:test'
import type { ConnectionStatus } from 'moi/collab'
import type { Connection } from '@/lib/collab/types'
import { summarizeWorkspaceUsers, resolvePeers, resolveUser } from './users'

const alice = { id: 'alice', name: 'Alice', color: 'emerald' } as const
const bob = { id: 'bob', name: 'Bob', color: 'blue' } as const
const eve = { id: 'eve', name: 'Eve', color: 'blue' } as const
function connection(
  connectionId: string,
  userId: string,
  page: string | null,
  status: ConnectionStatus = 'active'
): Connection {
  return { connectionId, userId, location: page === null ? null : { page, status }, presence: [] }
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
    color: 'emerald',
    name: '  ',
    email: '  user@example.test  '
  } as const
  expect(userDisplayName({ ...nameless, name: '  Named user  ' })).toBe('Named user')
  expect(userDisplayName(nameless)).toBe('user@example.test')
  expect(userDisplayName({ ...nameless, email: '  ' })).toBe('user-id')
  expect(userDisplayName({ id: 'only-id', color: 'emerald' })).toBe('only-id')
  expect(nameless.name).toBe('  ')
  expect(nameless.email).toBe('  user@example.test  ')
})

test('peers are other users, deduplicated across tabs, with page/workspace and status filters', () => {
  expect(resolvePeers(source, 'alice', { page: 'board', status: 'active' })).toEqual([
    { ...bob, status: 'active' }
  ])
  expect(
    resolvePeers(source, 'alice', { page: 'board', status: 'active' }, { scope: 'workspace' })
  ).toEqual([
    { ...bob, status: 'active' },
    { ...eve, status: 'away' }
  ])
  expect(resolvePeers(source, 'alice', null)).toEqual([])
  expect(resolvePeers(source, 'alice', null, { scope: 'workspace', status: 'away' })).toEqual([
    { ...eve, status: 'away' }
  ])
})

test('hidden tabs stay in their page peers and support the away filter', () => {
  const connections = [
    connection('self', 'alice', 'board'),
    connection('b1', 'bob', 'board', 'away'),
    connection('b2', 'bob', 'notes', 'away'),
    connection('e1', 'eve', 'notes', 'away')
  ]
  const source = { connections, users: [alice, bob, eve] }
  expect(resolvePeers(source, 'alice', { page: 'board', status: 'active' })).toEqual([
    { ...bob, status: 'away' }
  ])
  expect(
    resolvePeers(source, 'alice', { page: 'board', status: 'active' }, { status: 'away' })
  ).toEqual([{ ...bob, status: 'away' }])
  expect(
    resolvePeers(source, 'alice', { page: 'board', status: 'active' }, { status: 'active' })
  ).toEqual([])
  expect(
    summarizeWorkspaceUsers(connections, {
      currentUser: alice,
      page: 'board',
      users: source.users
    }).find(user => user.profile.id === 'bob')
  ).toMatchObject({ page: undefined, status: 'away' })
})

test('a visible connection makes the user active across their away page connections', () => {
  const connections = [connection('b1', 'bob', 'board', 'away'), connection('b2', 'bob', 'notes')]
  const source = { connections, users: [bob] }
  expect(resolveUser(source, 'bob')?.status).toBe('active')
  expect(
    resolvePeers(source, 'alice', { page: 'board', status: 'active' }, { status: 'away' })
  ).toEqual([])
  expect(
    resolvePeers(source, 'alice', { page: 'board', status: 'active' }, { status: 'active' })
  ).toEqual([{ ...bob, status: 'active' }])
})

test.each(['__proto__', 'constructor', 'toString'])('%s resolves as an ordinary user id', id => {
  const user = { ...alice, id }
  expect(resolveUser({ connections: [], users: [user] }, user.id)).toEqual({
    ...user,
    status: 'offline'
  })
  expect(resolveUser({ connections: [], users: [] }, id)).toBeUndefined()
})

test('member summary includes offline users and puts self first', () => {
  const users = [...source.users, { ...eve, id: 'offline' }]
  const result = summarizeWorkspaceUsers(connections, {
    currentUser: alice,
    page: 'board',
    users
  })
  expect(result[0]).toMatchObject({ profile: alice, self: true, page: 'board' })
  expect(result[1]).toMatchObject({ profile: bob, page: 'board', status: 'active' })
  expect(result.at(-1)).toMatchObject({ page: undefined, status: 'offline' })
})

test('summary prefers an active page, keeps the first active connection, and uses my current page', () => {
  const result = summarizeWorkspaceUsers(
    [
      connection('self-other', 'alice', 'notes'),
      connection('b-away', 'bob', 'old-page', 'away'),
      connection('b-active', 'bob', 'board'),
      connection('b-other', 'bob', 'notes'),
      connection('e-away', 'eve', 'notes', 'away')
    ],
    { currentUser: alice, page: 'current-page', users: [alice, bob, eve] }
  )
  expect(result[0]).toMatchObject({ self: true, page: 'current-page' })
  expect(result[1]).toMatchObject({ page: 'board', status: 'active' })
  expect(result[2]).toMatchObject({ page: undefined, status: 'away' })
})
