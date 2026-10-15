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
  expect(html).toContain('Sign in in your browser, then come back to moi.')
  expect(html).not.toContain('Having trouble signing in?')
  expect(html).not.toContain('ChatGPT security settings')
  expect(html).not.toContain('Authorization code')
})

test('local Claude waits for the browser callback with the code fallback hidden', () => {
  const html = render('claude-code', 'local', {
    availability: signedOut,
    login: {
      state: 'pending',
      id: 'test',
      url: 'https://claude.com/oauth/authorize',
      acceptsCode: true
    }
  })
  expect(html).toContain('Your workspace will open once you’re connected.')
  expect(html).toContain('Having trouble signing in?')
  expect(html).not.toContain('Authorization code')
  expect(html).toContain('Open sign-in page')
  expect(html).not.toContain('<h2')
})

test('cloud Claude asks for the full code from the sign-in page', () => {
  const html = render('claude-code', 'cloud', {
    availability: signedOut,
    login: {
      state: 'pending',
      id: 'test',
      url: 'https://claude.com/oauth/authorize',
      acceptsCode: true
    }
  })
  expect(html).toContain('full authorization code shown on that page')
  expect(html).toContain('Authorization code')
  expect(html).toContain('Submit code')
  expect(html).not.toContain('Having trouble signing in?')
})

test('connected, failed, and loading states do not offer a misleading login', () => {
  expect(render('codex', 'local', { availability: { status: 'available' } })).toContain('Connected')
  const failed = render('codex', 'cloud', {
    availability: { status: 'unavailable', reason: 'Network failed' }
  })
  expect(failed).toContain('Could not check agent login status')
  expect(failed).not.toContain('Log in')
  expect(render('codex', 'local')).not.toContain('Log in')
})

test('failed and expired login attempts still allow starting again', () => {
  for (const reason of ['Sign-in failed', 'Sign-in expired']) {
    const html = render('codex', 'cloud', {
      availability: signedOut,
      login: { state: 'failed', reason }
    })
    expect(html).toContain(reason)
    expect(html).toContain('Log in')
    expect(html).not.toContain('Cancel sign-in')
  }
})
