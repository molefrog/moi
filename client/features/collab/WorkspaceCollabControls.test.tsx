import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Router } from 'wouter'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import type { UserProfile, Connection } from '@/lib/collab/types'

import { WorkspaceCollabControls } from './WorkspaceCollabControls'
import { createFakeEngine } from './fake-engine'
import { CollabContext } from './hooks'
import { getCurrentUser, setCurrentUser } from './host-state'

const self = { id: 'self', name: 'Self', color: '#0f766e' }
const active = { id: 'active', name: 'Active colleague', color: '#2563eb' }
const away = { id: 'away', name: 'Away colleague', color: '#2563eb' }
const offline = Array.from({ length: 100 }, (_, index) => ({
  id: `offline-${index}`,
  name: `Offline colleague ${index}`,
  color: '#2563eb'
}))

function connection(user: UserProfile, page: string | null): Connection {
  return {
    connectionId: user.id,
    userId: user.id,
    location: page === null ? null : { page },
    presence: []
  }
}

function renderHeader(
  users: UserProfile[],
  otherConnections: Connection[],
  viewer: UserProfile = self
) {
  const previous = getCurrentUser()
  setCurrentUser(viewer)
  try {
    return renderToStaticMarkup(
      <Router ssrPath="/workspace/test/overview">
        <TooltipProvider>
          <CollabContext
            value={createFakeEngine({ self: viewer, page: 'overview', users, otherConnections })}
          >
            <WorkspaceCollabControls
              workspaceId="test"
              describeTab={() => null}
              onOpenTab={() => {}}
            />
          </CollabContext>
        </TooltipProvider>
      </Router>
    )
  } finally {
    setCurrentUser(previous)
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
  const third = { id: 'third', name: 'Third colleague', color: '#2563eb' }
  const fourth = { id: 'fourth', name: 'Fourth colleague', color: '#2563eb' }
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
  const viewer = { id: 'nameless-self', color: '#0f766e' }
  const user = { id: 'user-id', name: '', email: 'user@example.test', color: '#2563eb' }
  const noEmail = { id: 'another-member', name: '  ', color: '#2563eb' }
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
