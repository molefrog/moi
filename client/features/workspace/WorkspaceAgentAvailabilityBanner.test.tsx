import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { WorkspaceAgentAvailabilityBanner } from './WorkspaceAgentAvailabilityBanner'

const onRefresh = async () => {}
const onStartLogin = async () => ({ type: 'browser' as const, url: 'https://example.com/login' })

test('offers in-app sign-in with a visible terminal fallback', () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceAgentAvailabilityBanner, {
      availability: {
        available: false,
        reason: 'Codex is signed out. Sign in to send messages',
        recovery: { kind: 'login', command: 'codex login', inApp: true }
      },
      onRefresh,
      onStartLogin
    })
  )

  expect(html).toContain('Codex is signed out')
  expect(html).toContain('codex login')
  expect(html).toContain('Sign in')
  expect(html).toContain('Check again')
})

test('offers a copyable command for terminal-only sign-in', () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceAgentAvailabilityBanner, {
      availability: {
        available: false,
        reason: 'Claude is signed out. Sign in to send messages',
        recovery: { kind: 'login', command: 'claude auth login', inApp: false }
      },
      onRefresh,
      onStartLogin
    })
  )

  expect(html).toContain('claude auth login')
  expect(html).toContain('Copy command')
})
