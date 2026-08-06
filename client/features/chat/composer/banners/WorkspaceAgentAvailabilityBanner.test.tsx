import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { WorkspaceAgentAvailabilityBanner } from './WorkspaceAgentAvailabilityBanner'

test.each([
  ['Codex', 'codex login'],
  ['Claude', 'claude auth login']
])('offers sign-in for %s', (provider, loginCommand) => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceAgentAvailabilityBanner, {
      availability: {
        available: false,
        reason: `${provider} is signed out. Sign in to send messages`,
        loginCommand
      },
      onStartLogin: async () => ({})
    })
  )

  expect(html).toContain(`${provider} is signed out`)
  expect(html).toContain('Sign in')
})
