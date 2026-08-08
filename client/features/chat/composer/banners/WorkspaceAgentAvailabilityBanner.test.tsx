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

test('shows the shared ceremony state while a login is pending', () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceAgentAvailabilityBanner, {
      availability: {
        available: false,
        reason: 'Codex is signed out. Sign in to send messages',
        loginCommand: 'codex login'
      },
      login: { state: 'pending', url: 'https://example.com/login' },
      onStartLogin: async () => ({})
    })
  )

  expect(html).toContain('Waiting for log in…')
  expect(html).toContain('disabled')
})

test('surfaces a failed ceremony and offers login again', () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceAgentAvailabilityBanner, {
      availability: {
        available: false,
        reason: 'Codex is signed out. Sign in to send messages',
        loginCommand: 'codex login'
      },
      login: { state: 'failed', reason: 'Sign-in did not complete. Try again' },
      onStartLogin: async () => ({})
    })
  )

  expect(html).toContain('Sign-in did not complete. Try again')
  expect(html).toContain('>Log in</button>')
})
