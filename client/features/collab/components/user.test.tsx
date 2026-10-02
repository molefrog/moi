import { expect, test } from 'bun:test'

import { User } from './user'
import { createRoom, me, peer, renderCollab } from '../testing/component-fixtures'

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
