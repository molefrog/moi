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
  useUser
} from './hooks'

const alice = { id: 'alice', name: 'Alice', color: '#0f766e' }
const bob = { id: 'bob', name: 'Bob', color: '#2563eb' }
function Observer() {
  return (
    <output>
      {JSON.stringify({
        me: useMe(),
        peers: usePeers(),
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
