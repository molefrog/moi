import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CollabBackend } from './backend'
import { createFakeBackend } from './fake-backend'
import { setIdentity } from './identity'
import {
  AppletCollabProvider,
  CollabBackendProvider,
  useMe,
  usePeers,
  usePresence,
  usePublishPresence,
  useUser,
  useWorkspaceUsers
} from './hooks'
import type { CollabUser } from './hooks'

const alice = { id: 'alice', name: 'Alice', color: '#0f766e' }
const bob = { id: 'bob', name: 'Bob', color: '#2563eb' }
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
  const room = createFakeBackend({
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
  const backend: CollabBackend = {
    ...room,
    setPresence: registration => {
      publications++
      room.setPresence(registration)
    }
  }
  const html = renderToStaticMarkup(
    <CollabBackendProvider backend={backend}>
      <AppletCollabProvider workspaceId="test" applet={{ kind: 'view', name: 'board' }}>
        <Observer />
      </AppletCollabProvider>
    </CollabBackendProvider>
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

test('workspace users include self and offline members with workspace-wide status filters', () => {
  const carol = { id: 'carol', name: 'Carol', color: '#2563eb' }
  const david = { id: 'david', name: 'David', color: '#0f766e' }
  const room = createFakeBackend({
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
          <CollabBackendProvider backend={room}>
            <Directory />
          </CollabBackendProvider>
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
