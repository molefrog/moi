import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { AgentAvailabilityBanner } from './AgentAvailabilityBanner'

test('shows login-required messaging without a dialog', () => {
  const html = renderToStaticMarkup(
    createElement(AgentAvailabilityBanner, {
      availability: {
        status: 'login-required',
        reason: 'Sign in'
      }
    })
  )

  expect(html).toContain('Log in to your agent to send messages')
  expect(html).not.toContain('<button')
})

test('shows a disconnected state without login copy or action', () => {
  const html = renderToStaticMarkup(
    createElement(AgentAvailabilityBanner, {
      availability: { status: 'disconnected' }
    })
  )

  expect(html).toContain('Reconnecting to moi…')
  expect(html).toContain('tabler-icon-plug-connected-x')
  expect(html).not.toContain('Log in')
  expect(html).not.toContain('<button')
})

test('shows a generic unavailable reason without suggesting login', () => {
  const html = renderToStaticMarkup(
    createElement(AgentAvailabilityBanner, {
      availability: {
        status: 'unavailable',
        reason: 'Agent runtime is unavailable'
      }
    })
  )

  expect(html).toContain('Agent runtime is unavailable')
  expect(html).toContain('tabler-icon-alert-circle')
  expect(html).not.toContain('Log in')
  expect(html).not.toContain('<button')
})
