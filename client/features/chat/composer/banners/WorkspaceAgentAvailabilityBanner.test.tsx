import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { WorkspaceAgentAvailabilityBanner } from './WorkspaceAgentAvailabilityBanner'

test('offers login when the agent supports it', () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceAgentAvailabilityBanner, {
      availability: {
        status: 'login-required',
        reason: 'Sign in'
      },
      onStartLogin: async () => ({})
    })
  )

  expect(html).toContain('Log in to your agent to send messages')
  expect(html).toContain('>Log in</button>')
})

test('shows a disconnected state without login copy or action', () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceAgentAvailabilityBanner, {
      availability: { status: 'disconnected' },
      onStartLogin: async () => ({})
    })
  )

  expect(html).toContain('Reconnecting to moi…')
  expect(html).toContain('tabler-icon-plug-connected-x')
  expect(html).not.toContain('Log in')
  expect(html).not.toContain('<button')
})

test('shows a generic unavailable reason without suggesting login', () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceAgentAvailabilityBanner, {
      availability: {
        status: 'unavailable',
        reason: 'Agent runtime is unavailable'
      },
      onStartLogin: async () => ({})
    })
  )

  expect(html).toContain('Agent runtime is unavailable')
  expect(html).toContain('tabler-icon-alert-circle')
  expect(html).not.toContain('Log in')
  expect(html).not.toContain('<button')
})

test('shows the shared ceremony state while a login is pending', () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceAgentAvailabilityBanner, {
      availability: {
        status: 'login-required',
        reason: 'Sign in'
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
        status: 'login-required',
        reason: 'Sign in'
      },
      login: { state: 'failed', reason: 'Sign-in did not complete. Try again' },
      onStartLogin: async () => ({})
    })
  )

  expect(html).toContain('Sign-in did not complete. Try again')
  expect(html).toContain('>Log in</button>')
})
