import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { renderToStaticMarkup } from 'react-dom/server'
import * as config from '@/client/api/app-config'
import type { HarnessAuth, LoginHarness } from '@/client/features/harness/api'
import { WorkspaceLoginState } from './workspace-login-state'

let cfg: ReturnType<typeof spyOn<typeof config, 'useAppConfig'>>
beforeEach(() => {
  cfg = spyOn(config, 'useAppConfig')
})
afterEach(() => cfg.mockRestore())

function render(
  type: LoginHarness,
  environment: 'local' | 'cloud',
  data?: HarnessAuth,
  checking = false
) {
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
      <WorkspaceLoginState
        type={type}
        reason="Workspace credentials need attention"
        checking={checking}
        onRecheck={() => {}}
      />
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
  expect(html).toContain('Enable device code sign-in for Codex')
  expect(html).toContain('https://chatgpt.com/settings/security')
  expect(html).toContain('<ol')
  expect(html).toContain('https://auth.openai.com/codex/device')
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
  expect(html).toContain('Open browser')
  expect(html).toContain('Sign in in your browser, then come back to Moi.')
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
      url: 'https://claude.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1234%2Fcallback',
      codeUrl: 'https://claude.com/oauth/manual'
    }
  })
  expect(html).toContain('Your workspace will open once you’re connected.')
  expect(html).toContain('Having trouble signing in?')
  expect(html).not.toContain('Authorization code')
  expect(html).toContain('Open browser')
  expect(html).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A1234%2Fcallback')
  expect(html).not.toContain('https://claude.com/oauth/manual')
  expect(html).not.toContain('<h2')
})

test('cloud Claude asks for the full code from the sign-in page', () => {
  const html = render('claude-code', 'cloud', {
    availability: signedOut,
    login: {
      state: 'pending',
      id: 'test',
      url: 'https://claude.com/oauth/authorize',
      codeUrl: 'https://claude.com/oauth/authorize'
    }
  })
  expect(html).toContain('Paste the code here:')
  expect(html).toContain('Authorization code')
  expect(html).toContain('Continue')
  expect(html).not.toContain('Having trouble signing in?')
})

test('connected, failed, and loading states do not offer a misleading login', () => {
  const connected = render('codex', 'local', { availability: { status: 'available' } })
  expect(connected).toContain('Signed in to ChatGPT, but this workspace still needs attention')
  expect(connected).toContain('Workspace credentials need attention')
  expect(connected).toContain('Try again')
  expect(connected).not.toContain('Continue')
  const checking = render('codex', 'local', { availability: { status: 'available' } }, true)
  expect(checking).toContain('Checking workspace access…')
  expect(checking).toContain('disabled')
  expect(checking).not.toContain('Workspace credentials need attention')
  const failed = render('codex', 'cloud', {
    availability: { status: 'unavailable', reason: 'Network failed' }
  })
  expect(failed).toContain('Could not check agent login status')
  expect(failed).not.toContain('Continue')
  const loading = render('codex', 'local')
  expect(loading).not.toContain('Continue')
  expect(loading).toContain('aria-label="Loading"')
  expect(loading).not.toContain('data-slot="skeleton"')
})

test('failed and expired login attempts still allow starting again', () => {
  for (const reason of ['Sign-in failed', 'Sign-in expired']) {
    const html = render('codex', 'cloud', {
      availability: signedOut,
      login: { state: 'failed', reason }
    })
    expect(html).toContain(reason)
    expect(html).toContain('Continue')
    expect(html).not.toContain('Cancel sign-in')
    expect(html).not.toContain('Sign in in your browser')
    expect(html).not.toContain('Open browser')
  }
})

test('cloud Codex shows only Continue before a login attempt starts', () => {
  const html = render('codex', 'cloud', { availability: signedOut })
  expect(html).toContain('Continue')
  expect(html).not.toContain('Open settings')
  expect(html).not.toContain('device code sign-in')
  expect(html).not.toContain('Copy code')
})

test('starting login keeps the button until the browser link is ready', () => {
  for (const type of ['claude-code', 'codex'] as const) {
    for (const environment of ['local', 'cloud'] as const) {
      const html = render(type, environment, {
        availability: signedOut,
        login: { state: 'starting' }
      })
      expect(html).toContain('Continue')
      expect(html).toContain('disabled')
      expect(html).not.toContain('Sign in in your browser')
      expect(html).not.toContain('Open browser')
    }
  }
})

test('local Claude switches to manual code entry only through the trouble action', async () => {
  cfg.mockReturnValue({
    environment: 'local',
    demo: false,
    experimental: { collab: false },
    demoInstallUrl: ''
  })
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  const globals = {
    window,
    document,
    HTMLElement: window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true
  }
  const descriptors = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  const client = new QueryClient()
  const auth: HarnessAuth = {
    availability: signedOut,
    login: {
      state: 'pending',
      id: 'test',
      url: 'https://example.com/local',
      codeUrl: 'https://example.com/manual'
    }
  }
  client.setQueryData(['harness-auth', 'claude-code'], auth)
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(async () => Response.json(auth), { preconnect: fetch.preconnect })
  )
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <WorkspaceLoginState
            type="claude-code"
            reason="Sign in"
            checking={false}
            onRecheck={() => {}}
          />
        </QueryClientProvider>
      )
    )
    const link = document.querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://example.com/local')
    await act(async () => {
      link.click()
    })
    expect(document.querySelector('textarea')).toBeNull()
    const trouble = [...document.querySelectorAll('button')].find(
      button => button.textContent === 'Having trouble signing in?'
    )!
    await act(async () => {
      trouble.click()
    })
    expect(document.querySelector('a')?.getAttribute('href')).toBe('https://example.com/manual')
    expect(document.querySelector('textarea')?.getAttribute('aria-label')).toBe(
      'Authorization code'
    )
    expect(document.querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(true)
  } finally {
    await act(async () => root.unmount())
    client.clear()
    fetchSpy.mockRestore()
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
