import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { IconLayoutDashboard, IconScribble } from '@tabler/icons-react'
import { Router } from 'wouter'

import type { UserProfile, Connection } from '@/lib/collab/types'

import { WorkspaceUsersMenu, WorkspaceUsersList } from './workspace-users-menu'
import { createFakeEngine } from './testing/fake-engine'
import type { FakeEngineOptions } from './testing/fake-engine'
import { CollabContext } from './provider'
import { summarizeWorkspaceUsers } from './users'

const self = { id: 'self', name: 'Self', color: 'emerald' } as const
const active = { id: 'active', name: 'Active colleague', color: 'blue' } as const
const away = { id: 'away', name: 'Away colleague', color: 'blue' } as const
const offline = Array.from(
  { length: 100 },
  (_, index) =>
    ({ id: `offline-${index}`, name: `Offline colleague ${index}`, color: 'blue' }) as const
)

function connection(user: UserProfile, page: string | null): Connection {
  return {
    connectionId: user.id,
    userId: user.id,
    location: page === null ? null : { page, status: 'active' },
    presence: []
  }
}

function describeTab(tab: string) {
  if (tab === 'overview') return { label: 'Overview', Icon: IconLayoutDashboard }
  if (tab === 'scratchpad') return { label: 'Scratchpad', Icon: IconScribble }
  return null
}

function renderUsers(options: FakeEngineOptions, list = false) {
  const engine = createFakeEngine({ page: 'overview', ...options })
  const state = engine.getUsersSnapshot()
  const directory = engine.getWorkspaceDirectory()
  const users = summarizeWorkspaceUsers(state.connections, {
    currentUser: options.self,
    connectionId: state.connectionId,
    page: 'overview',
    users: directory?.status === 'ready' ? [...directory.users] : []
  })
  return renderToStaticMarkup(
    <Router ssrPath="/workspace/test/overview">
      <CollabContext value={engine}>
        {list ? (
          <WorkspaceUsersList
            users={users}
            page="overview"
            describeTab={describeTab}
            onOpenTab={() => {}}
          />
        ) : (
          <WorkspaceUsersMenu workspaceId="test" describeTab={describeTab} onOpenTab={() => {}} />
        )}
      </CollabContext>
    </Router>
  )
}

test('avatar group includes self and connected peers, excluding offline users', () => {
  const html = renderUsers({
    self,
    users: [...offline, active, self, away],
    otherConnections: [connection(active, 'overview'), connection(away, null)]
  })
  expect(html).toContain('aria-label="Users in this workspace"')
  expect(html).toContain('aria-label="Active colleague"')
  expect(html).toContain('aria-label="Away colleague"')
  expect(html.indexOf('aria-label="Self"')).toBeLessThan(
    html.indexOf('aria-label="Active colleague"')
  )
  expect(html).not.toContain('Offline colleague')
})

test('avatar overflow counts connected peers once, excluding offline users and own tabs', () => {
  const third = { id: 'third', name: 'Third colleague', color: 'blue' } as const
  const fourth = { id: 'fourth', name: 'Fourth colleague', color: 'blue' } as const
  const html = renderUsers({
    self,
    users: [self, ...offline, active, away, third, fourth],
    otherConnections: [
      connection(active, 'overview'),
      { ...connection(active, 'overview'), connectionId: 'active-second-tab' },
      connection(away, null),
      connection(third, 'overview'),
      connection(fourth, 'overview'),
      connection(self, 'overview')
    ]
  })
  expect(html).toContain('aria-label="Third colleague"')
  expect(html).toContain('aria-label="1 more"')
  expect(html.match(/aria-label="Self"/g)).toHaveLength(1)
  expect(html.match(/aria-label="Active colleague"/g)).toHaveLength(1)
  expect(html).not.toContain('Offline colleague')
  expect(html).not.toContain('aria-label="Fourth colleague"')
})

test('menu lists self, connected and away users, then informational offline members', () => {
  const html = renderUsers(
    {
      self,
      users: [offline[0], away, self, active],
      otherConnections: [connection(active, 'scratchpad'), connection(away, null)]
    },
    true
  )
  expect(html).toContain('>Overview<')
  expect(html.indexOf('aria-label="Self"')).toBeLessThan(html.indexOf('Away colleague'))
  expect(html.indexOf('Active colleague')).toBeLessThan(html.indexOf('Offline colleague'))
  expect(html).toContain('>Away<')
  expect(html).toContain('>Offline<')
  expect(html).toContain('title="Go to Scratchpad"')
  expect(html.match(/<button/g)).toHaveLength(1)
})

test('menu deduplicates tab labels and only offers known destinations outside the current tab', () => {
  const html = renderUsers(
    {
      self,
      users: [self, active, away],
      otherConnections: [
        connection(active, 'overview'),
        { ...connection(active, 'overview'), connectionId: 'active-second-tab' },
        { ...connection(active, 'scratchpad'), connectionId: 'active-third-tab' },
        connection(away, 'views/deleted')
      ]
    },
    true
  )
  expect(html).toContain('>Overview, Scratchpad<')
  expect(html).not.toContain('Overview, Overview')
  expect(html).toContain('title="Go to Scratchpad"')
  expect(html.match(/<button/g)).toHaveLength(1)
})

test('self and peers only on the current tab have informational menu rows', () => {
  const html = renderUsers(
    {
      self,
      users: [self, active],
      otherConnections: [connection(active, 'overview'), connection(self, 'scratchpad')]
    },
    true
  )
  expect(html).not.toContain('<button')
})

test('loading and authoritative empty directories do not leak live users into avatars', () => {
  for (const options of [
    { users: [self, active], directoryStatus: 'loading' as const },
    { users: [] }
  ]) {
    const html = renderUsers({
      self,
      otherConnections: [connection(active, 'overview')],
      ...options
    })
    expect(html).not.toContain('aria-label="Self"')
    expect(html).not.toContain('Active colleague')
  }
})

test('menu is hidden without a current user', () => {
  expect(
    renderUsers({
      self: undefined,
      users: [active],
      otherConnections: [connection(active, 'overview')]
    })
  ).toBe('')
})
