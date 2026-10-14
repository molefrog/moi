import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import * as appConfig from '@/client/api/app-config'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Router } from 'wouter'
import { renderToStaticMarkup } from 'react-dom/server'

import type { HarnessAvailability } from '@/lib/types'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { OnboardingFlow } from './onboarding-flow'

let configSpy: ReturnType<typeof spyOn<typeof appConfig, 'useAppConfig'>>

beforeEach(() => {
  configSpy = spyOn(appConfig, 'useAppConfig').mockReturnValue({
    environment: 'local',
    demo: false,
    experimental: { collab: false },
    demoInstallUrl: 'https://moi.computer'
  })
})

afterEach(() => configSpy.mockRestore())

function renderSetup(
  installed?: boolean,
  workspaceCount = 0,
  failed = false,
  authStatus: HarnessAvailability['status'] | 'pending' | 'error' = 'available',
  codexStatus?: HarnessAvailability['status']
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (installed !== undefined) {
    client.setQueryData(workspaceKeys.setupInfo, {
      installed: {
        'claude-code': installed,
        codex: codexStatus !== undefined,
        openclaw: false,
        hermes: false
      },
      availability: { 'claude-code': { status: 'login-required', reason: 'Sign in' } }
    })
    client.setQueryData(
      workspaceKeys.all,
      Array.from({ length: workspaceCount }, () => ({ id: 'test' }))
    )
  }
  const authKey = ['harness-auth', 'claude-code']
  if (authStatus !== 'pending') {
    client.setQueryData(authKey, { availability: { status: authStatus } })
  }
  if (codexStatus) {
    client.setQueryData(['harness-auth', 'codex'], { availability: { status: codexStatus } })
  }
  if (authStatus === 'error') {
    client
      .getQueryCache()
      .find({ queryKey: authKey })
      ?.setState({
        status: 'error',
        error: new Error('Auth check failed')
      })
  }
  if (failed) {
    client
      .getQueryCache()
      .find({ queryKey: workspaceKeys.setupInfo })
      ?.setState({
        status: 'error',
        error: new Error('Detection failed')
      })
  }
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <Router ssrPath="/">
        <OnboardingFlow>
          <p>Existing workspace</p>
        </OnboardingFlow>
      </Router>
    </QueryClientProvider>
  )
  client.clear()
  return html
}

test('shows a loading state until both checks finish', () => {
  const html = renderSetup()
  expect(html).toContain('Checking agents and workspaces')
  expect(html).not.toContain('Existing workspace')
})

test('missing installations gate existing workspaces', () => {
  const html = renderSetup(false, 1)
  expect(html).toContain('Connect an agent')
  expect(html).not.toContain('Existing workspace')
})

test('installed agents with no workspaces show the workspace step', () => {
  expect(renderSetup(true)).toContain('Create your first workspace')
})

test('signed-out agents do not return existing workspaces to onboarding', () => {
  expect(renderSetup(true, 1, false, 'login-required')).toContain('Existing workspace')
})

test('failed detection shows a retry instead of assuming no agent is installed', () => {
  const html = renderSetup(true, 1, true)
  expect(html).toContain('Could not check your setup')
  expect(html).toContain('Try again')
  expect(html).not.toContain('Connect an agent')
})

test('demo bypasses setup even before detection loads', () => {
  configSpy.mockReturnValue({
    environment: 'cloud',
    demo: true,
    experimental: { collab: false },
    demoInstallUrl: 'https://moi.computer'
  })
  expect(renderSetup()).toContain('Existing workspace')
})

test('signed-out agents show the agent screen before the first workspace', () => {
  const html = renderSetup(true, 0, false, 'login-required')
  expect(html).toContain('Connect at least one agent to use moi.')
  expect(html).toContain('Log in to Claude Code')
})

test('pending login checks keep onboarding in loading', () => {
  expect(renderSetup(true, 0, false, 'pending')).toContain('Checking agents and workspaces')
})

test('failed login checks show retry instead of the agent step', () => {
  const html = renderSetup(true, 0, false, 'error')
  expect(html).toContain('Could not check your setup')
  expect(html).not.toContain('Connect an agent')
})

test('existing workspaces ignore pending and failed global login checks', () => {
  for (const status of ['pending', 'error'] as const) {
    expect(renderSetup(true, 1, false, status)).toContain('Existing workspace')
  }
})

test('one connected harness is enough to continue', () => {
  expect(renderSetup(true, 0, false, 'login-required', 'available')).toContain(
    'Create your first workspace'
  )
  expect(renderSetup(true, 0, false, 'login-required', 'login-required')).toContain(
    'Connect an agent'
  )
})
