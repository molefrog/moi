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
  expect(removed).not.toContain('Ada')
  expect(removed).not.toContain('data-slot="avatar-badge"')
})

test.each(namelessUsers)(
  'nameless users have usable accessible labels and generated faces for %j',
  (profile: UserProfile, label: string) => {
    const engine = createRoom(profile)
    const user = renderCollab(engine, <User id={profile.id} />)
    expect(user).toContain(`aria-label="${label}"`)
    expect(user).toContain(`title="${label}"`)
    expect(user).toContain(`>${label}<`)
    expect(user).toContain('data-facehash')
    expect(user).toContain(`>${label.charAt(0).toUpperCase()}<`)
    expect(user).not.toContain('Unknown user')
    expect(engine.getWorkspaceDirectory().users?.[1]?.name).toBe(profile.name?.trim() || undefined)
  }
)
