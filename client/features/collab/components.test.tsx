import { expect, test } from 'bun:test'
import { Fragment } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { UserProfile } from '@/lib/collab/types'

import {
  Cursors,
  PresenceFrame,
  PresenceGroup,
  PresenceGutter,
  Selection,
  User
} from './components'
import { createFakeEngine } from './fake-engine'
import type { FakeEngine } from './fake-engine'
import { AppletPresenceProvider, CollabContext, presenceChannels } from './hooks'
import { presenceTarget } from './presence-target'
import { PresenceFramePrimitive } from './primitives'

const me: UserProfile = { id: 'me', name: 'Me', color: 'blue' }
const peer: UserProfile = { id: 'peer', name: 'Ada', color: 'cyan' }
function room(target = presenceTarget('task:42:title'), profile: UserProfile = peer) {
  return createFakeEngine({
    self: me,
    page: 'board',
    users: [me, profile],
    otherConnections: [
      {
        connectionId: 'remote',
        userId: profile.id,
        location: { page: 'board', status: 'active' },
        presence: [
          {
            registrationId: 'focus',
            appletId: 'view:board',
            channel: presenceChannels.field(target),
            value: true
          }
        ]
      }
    ]
  })
}
function render(backend: FakeEngine, children: ReactNode, active = true) {
  return renderToStaticMarkup(
    <CollabContext value={backend}>
      <AppletPresenceProvider appletId="view:board" active={active}>
        {children}
      </AppletPresenceProvider>
    </CollabContext>
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

test('presence frames skip missing users and hide the outline when no users resolve', () => {
  const backend = room()
  const frame = render(
    backend,
    <PresenceFramePrimitive ids={['missing', 'peer']}>
      <input />
    </PresenceFramePrimitive>
  )
  expect(frame).toContain('Ada')
  expect(frame).toContain('outline-collab')
  backend.setUsers([me])
  const removed = render(
    backend,
    <PresenceFramePrimitive ids={['missing', 'peer']}>
      <input />
    </PresenceFramePrimitive>
  )
  expect(removed).toContain('<input')
  expect(removed).not.toContain('outline-collab')
})

test.each([
  [{ id: 'user-id', color: 'cyan' }, 'user-id'],
  [{ id: 'user-id', name: '', color: 'cyan' }, 'user-id'],
  [{ id: 'user-id', name: '   ', email: 'user@example.test', color: 'cyan' }, 'user@example.test'],
  [{ id: 'user-id', email: 'user@example.test', color: 'cyan' }, 'user@example.test']
] satisfies Array<[UserProfile, string]>)(
  'nameless user UI resolves a usable label for %j',
  (profile: UserProfile, label: string) => {
    const engine = room(presenceTarget('task:42:title'), profile)
    const user = render(engine, <User id={profile.id} />)
    expect(user).toContain(`aria-label="${label}"`)
    expect(user).toContain(`title="${label}"`)
    expect(user).toContain(`>${label}<`)
    expect(user).toContain('data-facehash')
    expect(user).toContain(`>${label.charAt(0).toUpperCase()}<`)
    expect(user).not.toContain('Unknown user')
    expect(engine.getWorkspaceUsers()?.[1]?.name).toBe(profile.name?.trim() || undefined)

    const frame = render(
      engine,
      <PresenceFrame id="task:42:title">
        <input />
      </PresenceFrame>
    )
    expect(frame).toContain(`>${label}<`)
    const gutter = render(
      engine,
      <PresenceGutter id="task:42:title">
        <input />
      </PresenceGutter>
    )
    expect(gutter).toContain(`aria-label="${label}"`)

    engine.setOtherConnections([
      {
        connectionId: 'remote',
        userId: profile.id,
        location: { page: 'board', status: 'active' },
        presence: [
          {
            registrationId: 'cursor',
            appletId: 'view:board',
            channel: presenceChannels.cursor('board'),
            value: { x: 10, y: 20 }
          }
        ]
      }
    ])
    expect(render(engine, <Cursors id="board">Board</Cursors>)).toContain(`>${label}<`)
  }
)

test('frame and gutter resolve the same semantic target and reject a different record', () => {
  const backend = room()
  expect(
    render(
      backend,
      <PresenceFrame id="task:42:title">
        <input />
      </PresenceFrame>
    )
  ).toContain('Ada')
  expect(
    render(
      backend,
      <PresenceGutter id="task:42:title">
        <input />
      </PresenceGutter>
    )
  ).toContain('Ada')
  expect(
    render(
      backend,
      <PresenceFrame id="task:43:title">
        <input />
      </PresenceFrame>
    )
  ).not.toContain('Ada')
  expect(
    render(
      backend,
      <PresenceGutter id="task:43:title">
        <input />
      </PresenceGutter>
    )
  ).not.toContain('Ada')
})

test('inactive applets retain content and hide remote focus', () => {
  const html = render(
    room(),
    <PresenceFrame id="task:42:title">
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
      <PresenceFrame id="task:42:title">
        <PresenceGutter id="task:42:notes">
          <span>Local content</span>
        </PresenceGutter>
      </PresenceFrame>
    </Cursors>
  )
  expect(html).toContain('Local content')
  expect(html).not.toContain('data-slot="avatar"')
})

test('grouped wrappers keep remote focus attached to semantic IDs through reorder and removal', () => {
  for (const Wrapper of [PresenceFrame, PresenceGutter]) {
    const backend = room(presenceTarget('task:42', 'title'))
    const title = (
      <Wrapper key="title" id="title">
        <input aria-label="Title" />
      </Wrapper>
    )
    const notes = (
      <Wrapper key="notes" id="notes">
        <textarea aria-label="Notes" />
      </Wrapper>
    )
    const original = render(backend, <PresenceGroup id="task:42">{[title, notes]}</PresenceGroup>)
    const children = original.split('data-presence-target=')
    expect(children).toHaveLength(3)
    expect(children[1]).toStartWith('"task%3A42/title"')
    expect(children[1]).toContain('Ada')
    expect(children[2]).toStartWith('"task%3A42/notes"')
    expect(children[2]).not.toContain('Ada')

    const reordered = render(
      backend,
      <PresenceGroup id="task:42">{[notes, title]}</PresenceGroup>
    ).split('data-presence-target=')
    expect(reordered[1]).toStartWith('"task%3A42/notes"')
    expect(reordered[1]).not.toContain('Ada')
    expect(reordered[2]).toStartWith('"task%3A42/title"')
    expect(reordered[2]).toContain('Ada')

    expect(render(backend, <PresenceGroup id="task:42">{notes}</PresenceGroup>)).not.toContain(
      'Ada'
    )
    expect(render(backend, <PresenceGroup id="task:43">{title}</PresenceGroup>)).not.toContain(
      'Ada'
    )
  }
})

test('nested groups scope composed children and keep sibling groups independent', () => {
  function Address() {
    return (
      <div>
        <input aria-label="Street" />
        <input aria-label="City" />
      </div>
    )
  }
  const html = render(
    room(presenceTarget('users', 'user:42', 'address')),
    <PresenceGroup id="users">
      <div className="grid gap-4">
        <PresenceGroup id="user:42">
          <PresenceGutter id="address">
            <Address />
          </PresenceGutter>
        </PresenceGroup>
        <PresenceGroup id="user:43">
          <PresenceGutter id="address">
            <Address />
          </PresenceGutter>
        </PresenceGroup>
      </div>
    </PresenceGroup>
  )
  expect(html).toContain('class="grid gap-4"')
  const children = html.split('data-presence-target=')
  expect(children).toHaveLength(3)
  expect(children[1]).toStartWith('"users/user%3A42/address"')
  expect(children[1]).toContain('Ada')
  expect(children[2]).toStartWith('"users/user%3A43/address"')
  expect(children[2]).not.toContain('Ada')
  expect(html).toContain('Street')
  expect(html).toContain('City')
  expect(html).toContain('Ada')
})

test('frame and gutter require one direct element and reject fragments', () => {
  for (const Wrapper of [PresenceFrame, PresenceGutter]) {
    const invalidChildren: ReactNode[] = [
      null,
      false,
      '',
      'Title',
      0,
      undefined,
      [<input key="title" />],
      [<input key="title" />, <input key="notes" />],
      <Fragment key="one">
        <input />
      </Fragment>,
      <Fragment key="multiple">
        <input />
        <input />
      </Fragment>
    ]
    for (const children of invalidChildren) {
      // JavaScript applets can pass child shapes rejected by the TypeScript declaration.
      expect(() =>
        render(room(), <Wrapper id="title">{children as ReactElement}</Wrapper>)
      ).toThrow('exactly one child element')
    }
    expect(
      render(
        room(),
        <Wrapper id="title">
          <label>
            Title
            <input />
          </label>
        </Wrapper>
      )
    ).toContain('Title')
  }
})

test('groups add neither DOM nor presence publications', () => {
  const engine = room()
  let publications = 0
  const observed = {
    ...engine,
    setPresence: () => {
      publications++
    }
  }
  const child = <span>Local content</span>
  expect(
    render(
      observed,
      <PresenceGroup id="outer">
        <PresenceGroup id="inner">{child}</PresenceGroup>
      </PresenceGroup>
    )
  ).toBe(render(engine, child))
  expect(publications).toBe(0)
  expect(engine.getSnapshot().connections[0]?.presence).toEqual([])
})

test('selection uses group scope while preserving flexible children', () => {
  const engine = room()
  engine.setOtherConnections([
    {
      connectionId: 'remote',
      userId: peer.id,
      location: { page: 'board', status: 'active' },
      presence: [
        {
          registrationId: 'selection',
          appletId: 'view:board',
          channel: presenceChannels.selection(presenceTarget('tasks', '42')),
          value: true
        }
      ]
    }
  ])
  const html = render(
    engine,
    <>
      <PresenceGroup id="tasks">
        <Selection id="42" selected={false}>
          Title<strong>Details</strong>
        </Selection>
      </PresenceGroup>
      <PresenceGroup id="projects">
        <Selection id="42" selected={false}>
          Project
        </Selection>
      </PresenceGroup>
    </>
  )
  const targets = html.split('data-collab-target=')
  expect(targets).toHaveLength(3)
  expect(targets[1]).toStartWith('"tasks/42"')
  expect(targets[1]).toContain('Ada')
  expect(targets[1]).toContain('Title')
  expect(targets[1]).toContain('Details')
  expect(targets[2]).toStartWith('"projects/42"')
  expect(targets[2]).not.toContain('Ada')
})

test('path-like IDs stay separate from nested group boundaries in rendered controls', () => {
  const html = render(
    room(presenceTarget('a/b', 'title')),
    <>
      <PresenceGroup id="a/b">
        <PresenceFrame id="title">
          <input />
        </PresenceFrame>
      </PresenceGroup>
      <PresenceGroup id="a">
        <PresenceGroup id="b">
          <PresenceFrame id="title">
            <input />
          </PresenceFrame>
        </PresenceGroup>
      </PresenceGroup>
      <PresenceGroup id="a%2Fb">
        <PresenceFrame id="title">
          <input />
        </PresenceFrame>
      </PresenceGroup>
    </>
  )
  const targets = html.split('data-presence-target=')
  expect(targets[1]).toStartWith('"a%2Fb/title"')
  expect(targets[1]).toContain('Ada')
  expect(targets[2]).toStartWith('"a/b/title"')
  expect(targets[2]).not.toContain('Ada')
  expect(targets[3]).toStartWith('"a%252Fb/title"')
  expect(targets[3]).not.toContain('Ada')
})

test('blank group and control IDs fail clearly, including groups without any control', () => {
  for (const id of ['', '   ']) {
    expect(() =>
      render(
        room(),
        <PresenceGroup id={id}>
          <span>Content</span>
        </PresenceGroup>
      )
    ).toThrow('nonempty id')
    expect(() =>
      render(
        room(),
        <PresenceFrame id={id}>
          <input />
        </PresenceFrame>
      )
    ).toThrow('nonempty id')
    expect(() =>
      render(
        room(),
        <PresenceGutter id={id}>
          <input />
        </PresenceGutter>
      )
    ).toThrow('nonempty id')
    expect(() =>
      render(
        room(),
        <Selection id={id} selected={false}>
          Content
        </Selection>
      )
    ).toThrow('nonempty id')
  }
})
