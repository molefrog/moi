import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'bun:test'
import { UserAvatar, UserAvatarContainer } from './user-avatar'
import { UserContainer } from './user'
import { createRoom, me, namelessUsers, peer, renderCollab } from '../testing/component-fixtures'

test('avatar labels follow profile updates and authoritative removal', () => {
  const room = createRoom()
  const initial = renderCollab(room, <UserAvatarContainer id="peer" />)
  expect(initial).toContain('aria-label="Ada"')
  room.setUsers([me, { ...peer, name: 'Grace' }])
  const updated = renderCollab(room, <UserAvatarContainer id="peer" />)
  expect(updated).toContain('aria-label="Grace"')
  room.setOtherConnections([])
  const offline = renderCollab(room, <UserAvatarContainer id="peer" />)
  expect(offline).toContain('aria-label="Grace"')
  room.setUsers([me])
  const removed = renderCollab(room, <UserAvatarContainer id="peer" />)
  expect(removed).toContain('aria-label="Unknown user"')
  expect(removed).not.toContain('Grace')
})

test('nameless user labels and avatars identify users by email or stable id', () => {
  for (const [profile, label] of namelessUsers) {
    expect(renderCollab(createRoom(profile), <UserContainer id={profile.id} />)).toContain(label)
    expect(renderCollab(createRoom(profile), <UserAvatarContainer id={profile.id} />)).toContain(
      `aria-label="${label}"`
    )
  }
})

test('avatar renders supplied profile without a collaboration provider', () => {
  const html = renderToStaticMarkup(<UserAvatar profile={peer} active />)
  expect(html).toContain('aria-label="Ada"')
  expect(html).toContain('data-slot="avatar-badge"')
  expect(renderToStaticMarkup(<UserAvatar />)).toContain('aria-label="Unknown user"')
})
