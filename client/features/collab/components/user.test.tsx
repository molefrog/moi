import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'bun:test'

import { User, UserContainer } from './user'
import { createRoom, me, peer, renderCollab } from '../testing/component-fixtures'
import { createFakeEngine } from '../testing/fake-engine'

test('user rendering follows authoritative profile updates and removal', () => {
  const backend = createRoom()
  expect(renderCollab(backend, <UserContainer id="peer" />)).toContain('Ada')
  backend.setUsers([me, { ...peer, name: 'Grace' }])
  expect(renderCollab(backend, <UserContainer id="peer" />)).toContain('Grace')
  backend.setUsers([me])
  const removed = renderCollab(backend, <UserContainer id="peer" />)
  expect(removed).toContain('Unknown user')
  expect(removed).not.toContain('Grace')
})

test('you label is opt-in and identifies the current user by id', () => {
  const room = createRoom({ ...peer, name: me.name })
  expect(renderCollab(room, <UserContainer id={me.id} />)).not.toContain('(You)')
  expect(renderCollab(room, <UserContainer id={me.id} showYouLabel />)).toContain('(You)')
  expect(renderCollab(room, <UserContainer id={peer.id} showYouLabel />)).not.toContain('(You)')
  room.setUsers([peer])
  expect(renderCollab(room, <UserContainer id={me.id} showYouLabel />)).not.toContain('(You)')
})

test('you label follows display-name fallbacks and stays hidden without a current user', () => {
  const profile = { id: 'nameless', email: 'user@example.test', color: 'cyan' } as const
  const room = createFakeEngine({ self: profile, users: [profile] })
  const rendered = renderCollab(room, <UserContainer id={profile.id} showYouLabel />)
  expect(rendered).toContain('user@example.test')
  expect(rendered).toContain('(You)')
  const signedOut = createFakeEngine({ self: undefined, users: [profile] })
  expect(renderCollab(signedOut, <UserContainer id={profile.id} showYouLabel />)).not.toContain(
    '(You)'
  )
})

test('user renders supplied profile without a collaboration provider', () => {
  const html = renderToStaticMarkup(<User profile={peer} description="Account" showYouLabel />)
  expect(html).toContain('Ada')
  expect(html).toContain('Account')
  expect(html).toContain('(You)')
  expect(renderToStaticMarkup(<User />)).toContain('Unknown user')
})
