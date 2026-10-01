import { expect, test } from 'bun:test'
import { Selection } from './selection'
import { PresenceGroup } from './presence-group'
import { presenceChannels } from '../hooks'
import { presenceTarget } from '../presence-target'
import { createFocusRoom, peer, renderCollab } from '../testing/component-fixtures'

test('selection uses group scope while preserving flexible children', () => {
  const engine = createFocusRoom()
  engine.setOtherConnections([
    {
      connectionId: 'remote',
      userId: peer.id,
      location: { page: 'board', status: 'active' },
      presence: [
        {
          registrationId: 'selection',
          appletId: 'views/board',
          channel: presenceChannels.selection(presenceTarget('tasks', '42')),
          value: true
        }
      ]
    }
  ])
  const html = renderCollab(
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

test('selections reject blank IDs', () => {
  for (const id of ['', '   ']) {
    expect(() =>
      renderCollab(
        createFocusRoom(),
        <Selection id={id} selected={false}>
          Content
        </Selection>
      )
    ).toThrow('nonempty id')
  }
})

test('a remote deselection removes the user from the selected item', () => {
  const engine = createFocusRoom()
  for (const selected of [true, false]) {
    engine.setOtherConnections([
      {
        connectionId: 'remote',
        userId: peer.id,
        location: { page: 'board', status: 'active' },
        presence: [
          {
            registrationId: 'selection',
            appletId: 'views/board',
            channel: presenceChannels.selection(presenceTarget('42')),
            value: selected
          }
        ]
      }
    ])
    const html = renderCollab(
      engine,
      <Selection id="42" selected={false}>
        Task
      </Selection>
    )
    expect(html.includes('Ada')).toBe(selected)
    expect(html).toContain('Task')
  }
})
