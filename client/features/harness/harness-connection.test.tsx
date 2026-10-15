import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import * as config from '@/client/api/app-config'
import type { HarnessAuth } from './api'
import { HarnessConnection, type LoginHarness } from './harness-connection'

let cfg: ReturnType<typeof spyOn<typeof config, 'useAppConfig'>>
beforeEach(() => {
  cfg = spyOn(config, 'useAppConfig')
})
afterEach(() => cfg.mockRestore())

function render(type: LoginHarness, environment: 'local' | 'cloud', data?: HarnessAuth) {
  cfg.mockReturnValue({
    environment,
    demo: false,
    experimental: { collab: false },
    demoInstallUrl: ''
  })
  const client = new QueryClient()
  if (data) client.setQueryData(['harness-auth', type], data)
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <HarnessConnection type={type} />
    </QueryClientProvider>
  )
  client.clear()
  return html
}
const signedOut = { status: 'login-required', reason: 'Sign in' } as const

test('cloud Codex explains the setting and displays a code to enter on the provider page', () => {
  const html = render('codex', 'cloud', {
    availability: signedOut,
    login: {
      state: 'pending',
      id: 'test',
      url: 'https://auth.openai.com/codex/device',
      userCode: 'ABCD-1234'
    }
  })
  expect(html).toContain('ChatGPT security settings')
  expect(html).toContain('ABCD-1234')
  expect(html).not.toContain('Cancel sign-in')
  expect(html).toContain('Copy code')
  expect(html).not.toContain('Authorization code')
})

test('local Codex uses a browser link without code instructions', () => {
  const html = render('codex', 'local', {
    availability: signedOut,
    login: {
      state: 'pending',
      id: 'test',
      url: 'https://auth.openai.com/authorize'
    }
  })
  expect(html).not.toContain('Cancel sign-in')
  expect(html).toContain('Open sign-in page')
  expect(html).not.toContain('ChatGPT security settings')
  expect(html).not.toContain('Authorization code')
})

test('Claude uses the same code input in cloud and as a local fallback', () => {
  for (const environment of ['local', 'cloud'] as const) {
    const html = render('claude-code', environment, {
      availability: signedOut,
      login: {
        state: 'pending',
        id: 'test',
        url: 'https://claude.com/oauth/authorize',
        acceptsCode: true
      }
    })
    expect(html).toContain('Authorization code')
    expect(html).toContain('Submit code')
    expect(html).not.toContain('Cancel sign-in')
    expect(html).toContain(environment === 'local' ? 'browser window' : 'full authorization code')
  }
})

test('connected, failed, and loading states do not offer a misleading login', () => {
  expect(render('codex', 'local', { availability: { status: 'available' } })).toContain('Connected')
  const failed = render('codex', 'cloud', {
    availability: { status: 'unavailable', reason: 'Network failed' }
  })
  expect(failed).toContain('Could not check agent login status')
  expect(failed).not.toContain('Log in to Codex')
  expect(render('codex', 'local')).not.toContain('Log in to Codex')
})

test('failed and expired login attempts still allow starting again', () => {
  for (const reason of ['Sign-in failed', 'Sign-in expired']) {
    const html = render('codex', 'cloud', {
      availability: signedOut,
      login: { state: 'failed', reason }
    })
    expect(html).toContain(reason)
    expect(html).toContain('Log in to Codex')
    expect(html).not.toContain('Cancel sign-in')
  }
})
