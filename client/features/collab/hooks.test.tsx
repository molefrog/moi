import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CollabEngineApi } from './client'
import { createFakeEngine } from './testing/fake-engine'
import { publishUsers } from './host-state'
import {
  useMe,
  usePeers,
  usePresence,
  usePublishPresence,
  useUser,
  useUsers,
  useWorkspaceUsers
} from './hooks'
import { AppletPresenceProvider, CollabContext, pageFromPath } from './provider'
import type { WorkspaceUser } from './hooks'

const alice = { id: 'alice', name: 'Alice', color: 'emerald' } as const
const bob = { id: 'bob', name: 'Bob', color: 'blue' } as const

test('presence pages follow nested navigation paths and deployment bases, decoding once', () => {
  expect(pageFromPath('/workspace/test/views/board', 'test')).toBe('views/board')
  expect(pageFromPath('/prefix/workspace/test/views/draft', 'test', '/prefix')).toBe('views/draft')
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
    otherConnections: [
      {
        connectionId: 'b',
        userId: 'bob',
        location: { page: 'board', status: 'active' },
        presence: [
          {
            registrationId: 'field',
            appletId: 'views/board',
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
      <AppletPresenceProvider appletId="views/board">
        <Observer />
      </AppletPresenceProvider>
    </CollabContext>
  )
  expect(html).toContain('connectionId')
  expect(html).toContain('title')
  expect(html).toContain('Bob')
  expect(publications).toBe(0)
  expect(room.getSnapshot().connections[0]?.presence).toEqual([])
})

function Disabled() {
  usePublishPresence('editing', 'title')
  expect(useMe()).toBeUndefined()
  expect(useUser('missing')).toBeUndefined()
  expect(useUsers(['missing'])).toEqual([undefined])
  return <Observer />
}
test('hooks are safe without a backend or applet and resolve missing users to undefined', () => {
  publishUsers({ users: [] })
  const html = renderToStaticMarkup(<Disabled />)
  expect(html).toContain('[]')
})

test('a published directory resolves users without a workspace engine', () => {
  publishUsers({ me: 'alice', users: [alice, bob] })
  try {
    function Global() {
      return encodeURIComponent(
        JSON.stringify({ me: useMe(), user: useUser('bob'), users: useWorkspaceUsers() })
      )
    }
    // No room is joined here, so everyone resolves and reads as offline.
    expect(JSON.parse(decodeURIComponent(renderToStaticMarkup(<Global />)))).toEqual({
      me: { ...alice, status: 'offline' },
      user: { ...bob, status: 'offline' },
      users: [
        { ...alice, status: 'offline' },
        { ...bob, status: 'offline' }
      ]
    })
  } finally {
    publishUsers({ users: [] })
  }
})

test('user hooks preserve missing names for self, peers, and offline members', () => {
  const self = { id: 'self', color: 'emerald', email: 'self@example.test' } as const
  const peer = { id: 'bob', color: 'blue', email: 'bob@example.test' } as const
  const offline = { id: 'offline', color: 'blue' } as const
  const room = createFakeEngine({
    self,
    page: 'board',
    users: [self, peer, offline],
    otherConnections: [
      {
        connectionId: 'b',
        userId: peer.id,
        location: { page: 'board', status: 'active' },
        presence: []
      }
    ]
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
  ) as { me: WorkspaceUser; user: WorkspaceUser; peers: WorkspaceUser[]; users: WorkspaceUser[] }
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
  const carol = { id: 'carol', name: 'Carol', color: 'blue' } as const
  const david = { id: 'david', name: 'David', color: 'emerald' } as const
  const room = createFakeEngine({
    self: alice,
    page: 'board',
    users: [alice, bob, carol, david],
    otherConnections: [
      {
        connectionId: 'b1',
        userId: 'bob',
        location: { page: 'other-page', status: 'active' },
        presence: []
      },
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
    ) as Record<string, WorkspaceUser[]>

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

test('absent and empty directories preserve distinct user resolution', () => {
  const engine = createFakeEngine({
    self: alice,
    users: [alice, bob],
    otherConnections: [{ connectionId: 'b', userId: bob.id, location: null, presence: [] }]
  })
  engine.setUsers(undefined)
  function Directory() {
    const me = useMe()
    return encodeURIComponent(
      JSON.stringify({ users: useWorkspaceUsers(), me, hasMe: me !== undefined })
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
  const fallback = {
    users: [
      { ...alice, status: 'active' },
      { ...bob, status: 'away' }
    ],
    me: { ...alice, status: 'active' },
    hasMe: true
  }
  // Without a host directory, the viewer and live users stand in.
  expect(render()).toEqual(fallback)
  // An empty host directory is authoritative, even over the viewer.
  engine.setUsers([])
  expect(render()).toEqual({ users: [], hasMe: false })
  engine.setUsers([alice, bob])
  expect(render()).toEqual(fallback)
  engine.setUsers(undefined)
  expect(render()).toEqual(fallback)
})

test('away peers remain on the page while their focus presence is hidden', () => {
  const engine = createFakeEngine({
    self: alice,
    page: 'board',
    users: [alice, bob],
    otherConnections: [
      {
        connectionId: 'b',
        userId: bob.id,
        location: { page: 'board', status: 'away' },
        presence: [
          {
            registrationId: 'focus',
            appletId: 'views/board',
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
          <AppletPresenceProvider appletId="views/board">
            <Away />
          </AppletPresenceProvider>
        </CollabContext>
      )
    )
  )
  expect(result).toEqual({ peers: [{ ...bob, status: 'away' }], presence: [] })
})
