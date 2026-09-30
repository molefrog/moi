import { expect, test } from 'bun:test'
import { Activity } from './activity'
import { createRoom, me, peer, renderCollab } from '../testing/component-fixtures'

test('activity includes the viewer and scopes connected users to the page or workspace', () => {
  const engine = createRoom()
  engine.setUsers([me, peer, { id: 'offline', name: 'Offline', color: 'amber' }])
  engine.setOtherConnections([
    {
      connectionId: 'remote',
      userId: peer.id,
      location: { page: 'other-page', status: 'active' },
      presence: []
    },
    {
      connectionId: 'own-tab',
      userId: me.id,
      location: { page: 'board', status: 'active' },
      presence: []
    }
  ])
  const page = renderCollab(engine, <Activity />)
  expect(page).toContain('aria-label="1 users"')
  expect(page).toContain('aria-label="Me"')
  expect(page).not.toContain('aria-label="Ada"')
  const workspace = renderCollab(engine, <Activity scope="workspace" />)
  expect(workspace).toContain('aria-label="2 users"')
  expect(workspace).toContain('aria-label="Me"')
  expect(workspace).toContain('aria-label="Ada"')
  expect(workspace).not.toContain('Offline')
})
