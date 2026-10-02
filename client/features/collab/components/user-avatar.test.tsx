import { expect, test } from 'bun:test'
import { UserAvatar } from './user-avatar'
import { User } from './user'
import { createRoom, me, namelessUsers, peer, renderCollab } from '../testing/component-fixtures'

test('avatar labels follow profile updates and authoritative removal', () => {
  const room = createRoom()
  const initial = renderCollab(room, <UserAvatar id="peer" />)
  expect(initial).toContain('aria-label="Ada"')
  room.setUsers([me, { ...peer, name: 'Grace' }])
  const updated = renderCollab(room, <UserAvatar id="peer" />)
  expect(updated).toContain('aria-label="Grace"')
  room.setOtherConnections([])
  const offline = renderCollab(room, <UserAvatar id="peer" />)
  expect(offline).toContain('aria-label="Grace"')
  room.setUsers([me])
  const removed = renderCollab(room, <UserAvatar id="peer" />)
  expect(removed).toContain('aria-label="Unknown user"')
  expect(removed).not.toContain('Grace')
})

test('nameless user labels and avatars identify users by email or stable id', () => {
  for (const [profile, label] of namelessUsers) {
    expect(renderCollab(createRoom(profile), <User id={profile.id} />)).toContain(label)
    expect(renderCollab(createRoom(profile), <UserAvatar id={profile.id} />)).toContain(
      `aria-label="${label}"`
    )
  }
})
