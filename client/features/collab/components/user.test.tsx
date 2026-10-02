import { expect, test } from 'bun:test'

import { User } from './user'
import { createRoom, me, peer, renderCollab } from '../testing/component-fixtures'
import { createFakeEngine } from '../testing/fake-engine'

test('user rendering follows authoritative profile updates and removal', () => {
  const backend = createRoom()
  expect(renderCollab(backend, <User id="peer" />)).toContain('Ada')
  backend.setUsers([me, { ...peer, name: 'Grace' }])
  expect(renderCollab(backend, <User id="peer" />)).toContain('Grace')
  backend.setUsers([me])
  const removed = renderCollab(backend, <User id="peer" />)
  expect(removed).toContain('Unknown user')
  expect(removed).not.toContain('Grace')
})

test('you label is opt-in and identifies the current user by id', () => {
  const room = createRoom({ ...peer, name: me.name })
  expect(renderCollab(room, <User id={me.id} />)).not.toContain('(You)')
  expect(renderCollab(room, <User id={me.id} showYouLabel />)).toContain('(You)')
  expect(renderCollab(room, <User id={peer.id} showYouLabel />)).not.toContain('(You)')
  room.setUsers([peer])
  expect(renderCollab(room, <User id={me.id} showYouLabel />)).not.toContain('(You)')
})

test('you label follows display-name fallbacks and stays hidden without a current user', () => {
  const profile = { id: 'nameless', email: 'user@example.test', color: 'cyan' } as const
  const room = createFakeEngine({ self: profile, users: [profile] })
  const rendered = renderCollab(room, <User id={profile.id} showYouLabel />)
  expect(rendered).toContain('user@example.test')
  expect(rendered).toContain('(You)')
  const signedOut = createFakeEngine({ self: undefined, users: [profile] })
  expect(renderCollab(signedOut, <User id={profile.id} showYouLabel />)).not.toContain('(You)')
})
