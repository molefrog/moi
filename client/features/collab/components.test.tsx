import { expect, test } from 'bun:test'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { CollabIdentity } from '@/lib/collab/types'

import { Cursors, PresenceFrame, PresenceGutter, User } from './components'
import { createFakeBackend } from './fake-backend'
import type { FakeCollabBackend } from './fake-backend'
import { AppletCollabProvider, CollabBackendProvider, presenceChannels } from './hooks'

const me: CollabIdentity = { id: 'me', name: 'Me', color: '#123456' }
const peer: CollabIdentity = { id: 'peer', name: 'Ada', color: '#234567' }
function room() {
  return createFakeBackend({
    self: me,
    page: 'board',
    users: [me, peer],
    others: [
      {
        connectionId: 'remote',
        userId: peer.id,
        location: { page: 'board' },
        presence: [
          {
            registrationId: 'focus',
            surface: 'view:board',
            channel: presenceChannels.field('task:42:title'),
            value: true
          }
        ]
      }
    ]
  })
}
function render(backend: FakeCollabBackend, children: ReactNode, active = true) {
  return renderToStaticMarkup(
    <CollabBackendProvider backend={backend}>
      <AppletCollabProvider
        workspaceId="test"
        applet={{ kind: 'view', name: 'board' }}
        active={active}
      >
        {children}
      </AppletCollabProvider>
    </CollabBackendProvider>
  )
}

test('user rendering follows authoritative profile updates and removal', () => {
  const backend = room()
  expect(render(backend, <User id="peer" />)).toContain('Ada')
  backend.setUsers([me, { ...peer, name: 'Grace' }])
  expect(render(backend, <User id="peer" />)).toContain('Grace')
  backend.setUsers([me])
  const removed = render(backend, <User id="peer" />)
  expect(removed).toContain('Unknown user')
  expect(removed).not.toContain('Ada')
  expect(removed).not.toContain('data-slot="avatar-badge"')
})

test('frame and gutter resolve the same semantic target and reject a different record', () => {
  const backend = room()
  expect(
    render(
      backend,
      <PresenceFrame target="task:42:title">
        <input />
      </PresenceFrame>
    )
  ).toContain('Ada')
  expect(
    render(
      backend,
      <PresenceGutter target="task:42:title">
        <input />
      </PresenceGutter>
    )
  ).toContain('Ada')
  expect(
    render(
      backend,
      <PresenceFrame target="task:43:title">
        <input />
      </PresenceFrame>
    )
  ).not.toContain('Ada')
  expect(
    render(
      backend,
      <PresenceGutter target="task:43:title">
        <input />
      </PresenceGutter>
    )
  ).not.toContain('Ada')
})

test('inactive applets retain content and hide remote focus', () => {
  const html = render(
    room(),
    <PresenceFrame target="task:42:title">
      <input aria-label="Title" />
    </PresenceFrame>,
    false
  )
  expect(html).toContain('Title')
  expect(html).not.toContain('Ada')
})

test('connected components remain safe outside a collaboration provider', () => {
  const html = renderToStaticMarkup(
    <Cursors>
      <PresenceFrame target="task:42:title">
        <PresenceGutter target="task:42:notes">Local content</PresenceGutter>
      </PresenceFrame>
    </Cursors>
  )
  expect(html).toContain('Local content')
  expect(html).not.toContain('data-slot="avatar"')
})
