import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CollabEngineApi } from './engine'
import { createFakeEngine } from './fake-engine'
import { setIdentity } from './identity'
import {
  AppletScope,
  CollabContext,
  pageFromPath,
  useMe,
  usePeers,
  usePresence,
  usePublishPresence,
  useUser,
  useWorkspaceUsers,
  useWorkspaceUsersStatus
} from './hooks'
import type { CollabUser } from './hooks'

const alice = { id: 'alice', name: 'Alice', color: '#0f766e' }
const bob = { id: 'bob', name: 'Bob', color: '#2563eb' }

test('presence pages follow nested navigation paths and deployment bases, decoding once', () => {
  expect(pageFromPath('/workspace/test/views/board', 'test')).toBe('views/board')
  expect(pageFromPath('/prefix/workspace/test/view-builders/draft', 'test', '/prefix')).toBe(
    'view-builders/draft'
  )
  expect(pageFromPath('/prefix/workspace/test/views/%62oard', 'test', '/prefix')).toBe(
    'views/board'
  )
  expect(pageFromPath('/workspace/test/views/%2562oard', 'test')).toBe('views/%2562oard')
  expect(pageFromPath('/workspace/test/view:board', 'test')).toBe('views/board')
  expect(pageFromPath('/workspace/test', 'test')).toBe('overview')
})

function Observer() {
  return (
    <output>
      {JSON.stringify({
        me: useMe(),
        peers: usePeers(),
        users: useWorkspaceUsers(),
        user: useUser('bob'),
        presence: usePresence('editing')
      })}
    </output>
  )
}

test('observers resolve users and read presence without creating a publisher', () => {
  const room = createFakeEngine({
    self: alice,
    page: 'board',
    users: [alice, bob],
    others: [
      {
        connectionId: 'b',
        userId: 'bob',
        location: { page: 'board' },
        presence: [
          {
            registrationId: 'field',
            surface: 'view:board',
            channel: 'custom:editing',
            value: 'title'
          }
        ]
      }
    ]
  })
  let publications = 0
  const backend: CollabEngineApi = {
    ...room,
    setPresence: registration => {
      publications++
      room.setPresence(registration)
    }
  }
  const html = renderToStaticMarkup(
    <CollabContext value={backend}>
      <AppletScope surface="view:board">
        <Observer />
      </AppletScope>
    </CollabContext>
  )
  expect(html).toContain('connectionId')
  expect(html).toContain('title')
  expect(html).toContain('Bob')
  expect(publications).toBe(0)
  expect(room.getSnapshot().participants[0]?.presence).toEqual([])
})

function Disabled() {
  usePublishPresence('editing', 'title')
  return <Observer />
}
test('hooks are safe without a backend or applet and resolve missing users to null', () => {
  setIdentity(null)
  const html = renderToStaticMarkup(<Disabled />)
  expect(html).toContain('null')
  expect(html).toContain('[]')
})

test('user hooks preserve missing and empty names for self, peers, and offline members', () => {
  const self = { id: 'self', color: '#0f766e', email: 'self@example.test' }
  const peer = { id: 'bob', name: '', color: '#2563eb', email: 'bob@example.test' }
  const offline = { id: 'offline', color: '#336699' }
  const room = createFakeEngine({
    self,
    page: 'board',
    users: [self, peer, offline],
    others: [{ connectionId: 'b', userId: peer.id, location: { page: 'board' }, presence: [] }]
  })
  function Users() {
    return encodeURIComponent(
      JSON.stringify({
        me: useMe(),
        user: useUser('bob'),
        peers: usePeers(),
        users: useWorkspaceUsers()
      })
    )
  }
  const snapshot = JSON.parse(
    decodeURIComponent(
      renderToStaticMarkup(
        <CollabContext value={room}>
          <Users />
        </CollabContext>
      )
    )
  ) as { me: CollabUser; user: CollabUser; peers: CollabUser[]; users: CollabUser[] }
  expect(snapshot).toEqual({
    me: { ...self, status: 'active' },
    user: { ...peer, status: 'active' },
    peers: [{ ...peer, status: 'active' }],
    users: [
      { ...self, status: 'active' },
      { ...peer, status: 'active' },
      { ...offline, status: 'offline' }
    ]
  })
})

test('workspace users include self and offline members with workspace-wide status filters', () => {
  const carol = { id: 'carol', name: 'Carol', color: '#2563eb' }
  const david = { id: 'david', name: 'David', color: '#0f766e' }
  const room = createFakeEngine({
    self: alice,
    page: 'board',
    users: [alice, bob, carol, david],
    others: [
      { connectionId: 'b1', userId: 'bob', location: { page: 'other-page' }, presence: [] },
      { connectionId: 'b2', userId: 'bob', location: null, presence: [] },
      { connectionId: 'c', userId: 'carol', location: null, presence: [] }
    ]
  })
  function Directory() {
    // Encode the readout so React's HTML escaping does not alter the JSON.
    return encodeURIComponent(
      JSON.stringify({
        all: useWorkspaceUsers(),
        active: useWorkspaceUsers({ status: 'active' }),
        away: useWorkspaceUsers({ status: 'away' }),
        offline: useWorkspaceUsers({ status: 'offline' })
      })
    )
  }
  const render = () =>
    JSON.parse(
      decodeURIComponent(
        renderToStaticMarkup(
          <CollabContext value={room}>
            <Directory />
          </CollabContext>
        )
      )
    ) as Record<string, CollabUser[]>

  const snapshot = render()
  expect(snapshot.all).toEqual([
    { ...alice, status: 'active' },
    { ...bob, status: 'active' },
    { ...carol, status: 'away' },
    { ...david, status: 'offline' }
  ])
  expect(snapshot.active).toEqual([
    { ...alice, status: 'active' },
    { ...bob, status: 'active' }
  ])
  expect(snapshot.away).toEqual([{ ...carol, status: 'away' }])
  expect(snapshot.offline).toEqual([{ ...david, status: 'offline' }])

  // A host directory replacement removes even connected members and updates profiles.
  room.setUsers([alice, { ...david, name: 'David updated' }])
  const updated = render()
  expect(updated.all).toEqual([
    { ...alice, status: 'active' },
    { ...david, name: 'David updated', status: 'offline' }
  ])
  expect(updated.away).toEqual([])

  room.setUsers([])
  expect(render().all).toEqual([])
})

test('directory loading is distinguishable from an empty authoritative directory', () => {
  const engine = createFakeEngine({ self: alice, directoryStatus: 'loading' })
  function Directory() {
    return encodeURIComponent(
      JSON.stringify({
        status: useWorkspaceUsersStatus(),
        users: useWorkspaceUsers(),
        me: useMe()
      })
    )
  }
  const render = () =>
    JSON.parse(
      decodeURIComponent(
        renderToStaticMarkup(
          <CollabContext value={engine}>
            <Directory />
          </CollabContext>
        )
      )
    )
  expect(render()).toEqual({ status: 'loading', users: [], me: null })
  engine.setUsers([])
  expect(render()).toEqual({ status: 'ready', users: [], me: null })
  engine.setUsers([alice])
  expect(render()).toEqual({
    status: 'ready',
    users: [{ ...alice, status: 'active' }],
    me: { ...alice, status: 'active' }
  })
})

test('away peers remain on the page while their focus presence is hidden', () => {
  const engine = createFakeEngine({
    self: alice,
    page: 'board',
    users: [alice, bob],
    others: [
      {
        connectionId: 'b',
        userId: bob.id,
        location: { page: 'board', away: true },
        presence: [
          {
            registrationId: 'focus',
            surface: 'view:board',
            channel: 'custom:editing',
            value: 'title'
          }
        ]
      }
    ]
  })
  function Away() {
    return encodeURIComponent(
      JSON.stringify({ peers: usePeers({ status: 'away' }), presence: usePresence('editing') })
    )
  }
  const result = JSON.parse(
    decodeURIComponent(
      renderToStaticMarkup(
        <CollabContext value={engine}>
          <AppletScope surface="view:board">
            <Away />
          </AppletScope>
        </CollabContext>
      )
    )
  )
  expect(result).toEqual({ peers: [{ ...bob, status: 'away' }], presence: [] })
})
