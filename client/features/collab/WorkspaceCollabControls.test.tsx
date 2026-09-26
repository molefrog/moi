import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Router } from 'wouter'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import type { CollabIdentity, CollabParticipant } from '@/lib/collab/types'

import { WorkspaceCollabControls } from './WorkspaceCollabControls'
import { createFakeBackend } from './fake-backend'
import { CollabBackendProvider } from './hooks'
import { getIdentity, setIdentity } from './identity'

const self = { id: 'self', name: 'Self', color: '#0f766e' }
const active = { id: 'active', name: 'Active colleague', color: '#2563eb' }
const away = { id: 'away', name: 'Away colleague', color: '#2563eb' }
const offline = Array.from({ length: 100 }, (_, index) => ({
  id: `offline-${index}`,
  name: `Offline colleague ${index}`,
  color: '#2563eb'
}))

function connection(user: CollabIdentity, page: string | null): CollabParticipant {
  return {
    connectionId: user.id,
    userId: user.id,
    location: page === null ? null : { page },
    presence: []
  }
}

function renderHeader(users: CollabIdentity[], others: CollabParticipant[]) {
  const previous = getIdentity()
  setIdentity(self)
  try {
    return renderToStaticMarkup(
      <Router ssrPath="/workspace/test/overview">
        <TooltipProvider>
          <CollabBackendProvider
            backend={createFakeBackend({ self, page: 'overview', users, others })}
          >
            <WorkspaceCollabControls
              workspaceId="test"
              describeTab={() => null}
              onOpenTab={() => {}}
            />
          </CollabBackendProvider>
        </TooltipProvider>
      </Router>
    )
  } finally {
    setIdentity(previous)
  }
}

test('header shows active and away colleagues without offline directory members', () => {
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

test('header overflow counts connected people once, excluding offline members and own tabs', () => {
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
