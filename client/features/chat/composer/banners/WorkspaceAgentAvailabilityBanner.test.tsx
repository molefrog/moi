import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { WorkspaceAgentAvailabilityBanner } from './WorkspaceAgentAvailabilityBanner'

test('offers login when the agent supports it', () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceAgentAvailabilityBanner, {
      availability: {
        available: false,
        reason: 'Provider unavailable',
        loginCommand: 'codex login'
      },
      onStartLogin: async () => ({})
    })
  )

  expect(html).toContain('Log in to your agent provider to send messages')
  expect(html).toContain('>Log in</button>')
})
