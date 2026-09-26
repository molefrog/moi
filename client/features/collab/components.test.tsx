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
function room(target = 'task:42:title') {
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
            channel: presenceChannels.field(target),
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

test('each wrapper attaches remote focus only to the matching keyed child', () => {
  for (const Wrapper of [PresenceFrame, PresenceGutter]) {
    const backend = room('task:42/title')
    const title = <input key="title" aria-label="Title" />
    const notes = <textarea key="notes" aria-label="Notes" />
    const original = render(
      backend,
      <Wrapper target="task:42" each>
        {[title, notes]}
      </Wrapper>
    )
    const children = original.split('data-presence-target=')
    expect(children).toHaveLength(3)
    expect(children[1]).toStartWith('"task:42/title"')
    expect(children[1]).toContain('Ada')
    expect(children[2]).toStartWith('"task:42/notes"')
    expect(children[2]).not.toContain('Ada')

    const reordered = render(
      backend,
      <Wrapper target="task:42" each>
        {[notes, title]}
      </Wrapper>
    ).split('data-presence-target=')
    expect(reordered[1]).toStartWith('"task:42/notes"')
    expect(reordered[1]).not.toContain('Ada')
    expect(reordered[2]).toStartWith('"task:42/title"')
    expect(reordered[2]).toContain('Ada')

    expect(
      render(
        backend,
        <Wrapper target="task:42" each>
          {notes}
        </Wrapper>
      )
    ).not.toContain('Ada')
    expect(
      render(
        backend,
        <Wrapper target="task:43" each>
          {title}
        </Wrapper>
      )
    ).not.toContain('Ada')
  }
})

test('each mode scopes composed children and leaves nested targets explicit', () => {
  function Address() {
    return (
      <div>
        <input aria-label="Street" />
        <input aria-label="City" />
      </div>
    )
  }
  const html = render(
    room('person/address'),
    <PresenceGutter target="person" each className="grid gap-4">
      <Address key="address" />
      <PresenceFrame key="bio" target="person:bio">
        <textarea />
      </PresenceFrame>
    </PresenceGutter>
  )
  expect(html).toContain('class="grid gap-4"')
  expect(html).toContain('data-presence-target="person/address"')
  expect(html).toContain('data-presence-target="person/bio"')
  expect(html).toContain('data-presence-target="person:bio"')
  expect(html).toContain('Street')
  expect(html).toContain('City')
  expect(html).toContain('Ada')
})

test('each wrappers ignore absent children but do not invent targets for unkeyed items', () => {
  for (const Wrapper of [PresenceFrame, PresenceGutter]) {
    expect(
      render(
        room(),
        <Wrapper target="empty" each>
          {null}
          {false}
          {''}
        </Wrapper>
      )
    ).not.toContain('data-presence-target')
    expect(() =>
      render(
        room(),
        <Wrapper target="task" each>
          <input />
        </Wrapper>
      )
    ).toThrow('explicit, stable key')
  }
})
