import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { PresenceFrame, PresenceOutline } from './presence-frame'
import { PresenceAvatars } from './presence-avatars'
import { presenceTarget } from '../presence-target'
import { PresenceGroup } from './presence-group'
import { presenceChannels } from '../hooks'
import {
  createFocusRoom,
  me,
  peer,
  namelessUsers,
  renderCollab
} from '../testing/component-fixtures'

test('presence frames skip unresolved users and clear their identity after removal', () => {
  const backend = createFocusRoom()
  const frame = renderCollab(
    backend,
    <PresenceOutline ids={['missing', 'peer']}>
      <input />
    </PresenceOutline>
  )
  expect(frame).toContain('Ada')
  expect(frame).not.toContain('Unknown user')
  backend.setUsers([me])
  const removed = renderCollab(
    backend,
    <PresenceOutline ids={['missing', 'peer']}>
      <input />
    </PresenceOutline>
  )
  expect(removed).toContain('<input')
  expect(removed).not.toContain('Ada')
  expect(removed).not.toContain('Unknown user')
})

test('inactive applets retain content and hide remote focus', () => {
  const html = renderCollab(
    createFocusRoom(),
    <PresenceFrame id="task:42:title">
      <input aria-label="Title" />
    </PresenceFrame>,
    false
  )
  expect(html).toContain('Title')
  expect(html).not.toContain('Ada')
})

test('presence-frame resolves a usable label for nameless user', () => {
  const [profile, label] = namelessUsers[0]!
  const engine = createFocusRoom(presenceTarget('task:42:title'), profile)
  const html = renderCollab(
    engine,
    <PresenceFrame id="task:42:title">
      <input />
    </PresenceFrame>
  )
  expect(html).toContain(`>${label}<`)
})

test('presence-frame matches the semantic target and rejects a different record', () => {
  const backend = createFocusRoom()
  expect(
    renderCollab(
      backend,
      <PresenceFrame id="task:42:title">
        <input />
      </PresenceFrame>
    )
  ).toContain('Ada')
  expect(
    renderCollab(
      backend,
      <PresenceFrame id="task:43:title">
        <input />
      </PresenceFrame>
    )
  ).not.toContain('Ada')
})

test('presence-frame retains content outside a collaboration provider', () => {
  const html = renderToStaticMarkup(
    <PresenceFrame id="task:42:title">
      <PresenceAvatars id="task:42:notes">
        <span>Local content</span>
      </PresenceAvatars>
    </PresenceFrame>
  )
  expect(html).toContain('Local content')
})

test('automatic targets show remote presence across list and fragment children', () => {
  for (const Wrapper of [PresenceFrame, PresenceAvatars]) {
    const fields = [
      <input key="title" aria-label="Title" />,
      <input key="notes" aria-label="Notes" />
    ]
    for (const children of [fields, <>{fields}</>]) {
      const html = renderCollab(createFocusRoom(), <Wrapper id="task:42:title">{children}</Wrapper>)
      expect(html).toContain('Title')
      expect(html).toContain('Notes')
      expect(html).toContain('Ada')
    }
  }
})

test('presence-frame rejects blank IDs', () => {
  for (const id of ['', '   ']) {
    expect(() =>
      renderCollab(
        createFocusRoom(),
        <PresenceFrame id={id}>
          <input />
        </PresenceFrame>
      )
    ).toThrow('nonempty id')
  }
})

test('controlled presence uses group scope while preserving flexible children', () => {
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
          channel: presenceChannels.target(presenceTarget('tasks', '42')),
          value: true
        }
      ]
    }
  ])
  const html = renderCollab(
    engine,
    <>
      <PresenceGroup id="tasks">
        <PresenceFrame id="42" present={false}>
          Title<strong>Details</strong>
        </PresenceFrame>
      </PresenceGroup>
      <PresenceGroup id="projects">
        <PresenceFrame id="42" present={false}>
          Project
        </PresenceFrame>
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

test('controlled frames reject blank IDs', () => {
  for (const id of ['', '   ']) {
    expect(() =>
      renderCollab(
        createFocusRoom(),
        <PresenceFrame id={id} present={false}>
          Content
        </PresenceFrame>
      )
    ).toThrow('nonempty id')
  }
})

test('both appearances reflect remote controlled presence clearing', () => {
  for (const Wrapper of [PresenceFrame, PresenceAvatars]) {
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
              channel: presenceChannels.target(presenceTarget('42')),
              value: selected
            }
          ]
        }
      ])
      const html = renderCollab(
        engine,
        <Wrapper id="42" present={false}>
          Task
        </Wrapper>
      )
      expect(html.includes('Ada')).toBe(selected)
      expect(html).toContain('Task')
    }
  }
})
