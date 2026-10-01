import { expect, test } from 'bun:test'
import { UserAvatar } from './user-avatar'
import { createRoom, me, namelessUsers, peer, renderCollab } from '../testing/component-fixtures'

test('avatars follow profile updates and authoritative removal, including status', () => {
  const room = createRoom()
  const initial = renderCollab(room, <UserAvatar id="peer" />)
  expect(initial).toContain('aria-label="Ada"')
  expect(initial).toContain('data-slot="avatar-badge"')
  room.setUsers([me, { ...peer, name: 'Grace' }])
  const updated = renderCollab(room, <UserAvatar id="peer" />)
  expect(updated).toContain('aria-label="Grace"')
  room.setOtherConnections([])
  const offline = renderCollab(room, <UserAvatar id="peer" />)
  expect(offline).toContain('aria-label="Grace"')
  expect(offline).not.toContain('data-slot="avatar-badge"')
  room.setUsers([me])
  const removed = renderCollab(room, <UserAvatar id="peer" />)
  expect(removed).toContain('aria-label="Unknown user"')
  expect(removed).not.toContain('Grace')
  expect(removed).not.toContain('data-slot="avatar-badge"')
})

test.each(namelessUsers)(
  'nameless avatars remain identifiable to screen readers for %j',
  (profile, label) => {
    const html = renderCollab(createRoom(profile), <UserAvatar id={profile.id} />)
    expect(html).toContain(`aria-label="${label}"`)
    expect(html).not.toContain('Unknown user')
  }
)
