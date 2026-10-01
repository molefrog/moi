import { expect, test } from 'bun:test'
import type { UserProfile } from '@/lib/collab/types'

import { User } from './user'
import { createRoom, me, namelessUsers, peer, renderCollab } from '../testing/component-fixtures'

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

test.each(namelessUsers)(
  'nameless users still display an identifiable name for %j',
  (profile: UserProfile, label: string) => {
    const engine = createRoom(profile)
    const user = renderCollab(engine, <User id={profile.id} />)
    expect(user).toContain(`>${label}<`)
    expect(user).not.toContain('Unknown user')
  }
)
