import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Router } from 'wouter'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import type { UserProfile, Connection } from '@/lib/collab/types'

import { WorkspaceCollabToolbar } from './workspace-collab-toolbar'
import { useCollabEnabled } from '../provider'
import { createFakeEngine } from '../testing/fake-engine'
import { CollabContext } from '../provider'
import { getCurrentUser, setHostState } from '../host-state'

const self = { id: 'self', name: 'Self', color: 'emerald' } as const
const active = { id: 'active', name: 'Active colleague', color: 'blue' } as const
const away = { id: 'away', name: 'Away colleague', color: 'blue' } as const
const offline = Array.from(
  { length: 100 },
  (_, index) =>
    ({
      id: `offline-${index}`,
      name: `Offline colleague ${index}`,
      color: 'blue'
    }) as const
)

function connection(user: UserProfile, page: string | null): Connection {
  return {
    connectionId: user.id,
    userId: user.id,
    location: page === null ? null : { page, status: 'active' },
    presence: []
  }
}

function renderHeader(
  users: UserProfile[],
  otherConnections: Connection[],
  viewer: UserProfile = self
) {
  const previous = getCurrentUser()
  setHostState({ currentUser: viewer, workspaces: {} })
  try {
    return renderToStaticMarkup(
      <Router ssrPath="/workspace/test/overview">
        <TooltipProvider>
          <CollabContext
            value={createFakeEngine({ self: viewer, page: 'overview', users, otherConnections })}
          >
            <WorkspaceCollabToolbar
              workspaceId="test"
              describeTab={() => null}
              onOpenTab={() => {}}
            />
          </CollabContext>
        </TooltipProvider>
      </Router>
    )
  } finally {
    setHostState({ currentUser: previous, workspaces: {} })
  }
}

test('header shows active and away users without offline workspace users', () => {
  const html = renderHeader(
    [self, ...offline, active, away],
    [connection(active, 'overview'), connection(away, null)]
  )

  expect(html).toContain('aria-label="Active colleague"')
  expect(html).toContain('aria-label="Away colleague"')
  expect(html).toContain('aria-label="Self (you)"')
  expect(html).not.toContain('Offline colleague')
  expect(html).not.toMatch(/title="\d+ more"/)
})

test('header overflow counts connected users once, excluding offline users and own tabs', () => {
  const third = { id: 'third', name: 'Third colleague', color: 'blue' } as const
  const fourth = { id: 'fourth', name: 'Fourth colleague', color: 'blue' } as const
  const html = renderHeader(
    [self, ...offline, active, away, third, fourth],
    [
      connection(active, 'overview'),
      { ...connection(active, 'overview'), connectionId: 'active-second-tab' },
      connection(away, null),
      connection(third, 'overview'),
      connection(fourth, 'overview'),
      connection(self, 'overview')
    ]
  )

  expect(html).toContain('aria-label="Active colleague"')
  expect(html).toContain('aria-label="Away colleague"')
  expect(html).toContain('aria-label="Third colleague"')
  expect(html).toContain('title="1 more"')
  expect(html).toContain('>+1<')
  expect(html).not.toContain('Offline colleague')
  expect(html).not.toContain('aria-label="Fourth colleague"')
})

test('header gives nameless viewers and connected users nonempty accessible labels', () => {
  const viewer = { id: 'nameless-self', color: 'emerald' } as const
  const user = { id: 'user-id', name: '', email: 'user@example.test', color: 'blue' } as const
  const noEmail = { id: 'another-member', name: '  ', color: 'blue' } as const
  const html = renderHeader(
    [viewer, user, noEmail],
    [connection(user, 'overview'), connection(noEmail, 'overview')],
    viewer
  )
  expect(html).toContain('aria-label="nameless-self (you)"')
  expect(html).toContain('aria-label="user@example.test"')
  expect(html).toContain('aria-label="another-member"')
  expect(html).not.toContain('undefined')
  expect(html).not.toContain('aria-label=""')
  expect(html).not.toContain('Unknown user')
})

function CollabEnabled() {
  return <output>{String(useCollabEnabled())}</output>
}

test('collab toolbar and browser-tab selection require runtime support and a current user', () => {
  for (const [user, enabled, expected] of [
    [undefined, true, false],
    [self, false, false],
    [self, true, true]
  ] as const) {
    const engine = createFakeEngine({ self: user })
    const html = renderToStaticMarkup(
      <CollabContext value={{ ...engine, enabled }}>
        <CollabEnabled />
      </CollabContext>
    )
    expect(html).toBe(`<output>${expected}</output>`)
  }
})
