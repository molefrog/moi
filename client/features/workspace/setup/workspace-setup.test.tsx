import { afterEach, expect, spyOn, test } from 'bun:test'
import { act, useState, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import * as router from 'wouter'
import { createPortal } from 'react-dom'
import { parseHTML } from 'linkedom'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'

import * as config from '@/client/api/app-config'
import { workspaceKeys } from '@/client/api/workspace-keys'
import * as events from '@/client/runtime/useWorkspaceEvents'
import type { WorkspaceAgent, HarnessAvailability } from '@/lib/types'
import { ScopedPortal } from '@/ui-components/scoped-portal'
import { WorkspaceSetup } from './workspace-setup'

let cleanup = async () => {}
afterEach(() => cleanup())

async function mount(
  status: HarnessAvailability = { status: 'login-required', reason: 'Sign in' },
  demo = false,
  globalConnected = false,
  contentPending = false
) {
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
  notifyManager.setNotifyFunction(callback => act(callback))
  const configSpy = spyOn(config, 'useAppConfig').mockReturnValue({
    environment: 'cloud',
    demo,
    experimental: { collab: false },
    demoInstallUrl: ''
  })
  const destinations: string[] = []
  const locationSpy = spyOn(router, 'useLocation').mockReturnValue([
    '/workspace/test',
    path => {
      destinations.push(path)
    }
  ])
  const eventsSpy = spyOn(events, 'useWorkspaceEvent').mockImplementation(() => {})
  const reconnectSpy = spyOn(events, 'onWorkspaceEventsReconnect').mockReturnValue(() => {})
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const key = workspaceKeys.agent('test')
  let data: WorkspaceAgent = {
    provider: 'codex',
    availability: status,
    models: [],
    supportsStreaming: true,
    supportsArchiving: true
  }
  let fail = false
  client.setQueryData(key, data)
  const globalAuth = {
    availability: globalConnected
      ? { status: 'available' }
      : { status: 'login-required', reason: 'Sign in' }
  }
  client.setQueryData(['harness-auth', 'codex'], globalAuth)
  const requests: string[] = []
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        requests.push(path)
        if (path === '/api/workspaces/test' && init?.method === 'DELETE') {
          return new Response(null, { status: 204 })
        }
        if (path === '/api/workspaces/test/agent?refresh=true') {
          if (fail) throw new Error('Offline')
          return Response.json(data)
        }
        if (path === '/api/harnesses/codex/auth') return Response.json(globalAuth)
        throw new Error(`Unexpected request: ${path}`)
      },
      { preconnect: fetch.preconnect }
    )
  )
  function Portal(props: ComponentProps<'div'>) {
    return createPortal(<div {...props} />, document.body)
  }
  function Content() {
    const [draft, setDraft] = useState('Draft and attachments')
    return (
      <div data-content>
        <button onClick={() => setDraft('Edited draft and attachments')}>{draft}</button>
        <ScopedPortal portal={Portal}>
          <button id="floating-chat">Floating chat</button>
        </ScopedPortal>
      </div>
    )
  }
  const root = createRoot(document.getElementById('root')!)
  cleanup = async () => {
    await act(async () => {
      root.unmount()
      client.clear()
      await Bun.sleep(0)
    })
    fetchSpy.mockRestore()
    configSpy.mockRestore()
    locationSpy.mockRestore()
    eventsSpy.mockRestore()
    reconnectSpy.mockRestore()
    notifyManager.setNotifyFunction(callback => callback())
    for (const [key, value] of descriptors) {
      if (value) Object.defineProperty(globalThis, key, value)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
  const render = () => {
    root.render(
      <QueryClientProvider client={client}>
        <WorkspaceSetup workspaceId="test" contentPending={contentPending}>
          <Content />
        </WorkspaceSetup>
      </QueryClientProvider>
    )
  }
  await act(async () => {
    render()
    await Bun.sleep(20)
  })
  await act(async () => {
    await Bun.sleep(20)
  })
  const update = async (availability: HarnessAvailability) => {
    data = { ...data, availability }
    await act(async () => {
      client.setQueryData(key, data)
      await Bun.sleep(20)
    })
  }
  const button = (text: string) =>
    Array.from(document.querySelectorAll('button')).find(item => item.textContent?.includes(text))!
  const click = async (text: string) => {
    await act(async () => {
      button(text).click()
      await Bun.sleep(20)
    })
    await act(async () => {
      await Bun.sleep(20)
    })
  }
  return {
    setContentPending: async (value: boolean) => {
      contentPending = value
      await act(async () => {
        render()
      })
    },
    destinations,
    configSpy,
    document,
    update,
    click,
    requests,
    setFail: (value: boolean) => {
      fail = value
    },
    client,
    key
  }
}

test('signed-out workspace shows only its own login and no workspace content', async () => {
  const { document } = await mount()
  expect(document.body.textContent).toContain('Log in to Codex')
  expect(document.body.textContent).not.toContain('Claude Code')
  expect(document.querySelector('[data-content]')).toBeNull()
})

test('fresh readiness from home opens the workspace without another request', async () => {
  const { document, requests } = await mount({ status: 'available' })
  expect(document.querySelector('[data-content]')).not.toBeNull()
  expect(document.querySelector('[role="status"]')).toBeNull()
  expect(requests).toEqual([])
})

test('one loading state waits for workspace content after readiness succeeds', async () => {
  const { document, setContentPending } = await mount({ status: 'available' }, false, false, true)
  expect(document.querySelector('[aria-label="Loading"]')).not.toBeNull()
  expect(document.querySelector('[data-content]')).toBeNull()
  await setContentPending(false)
  expect(document.querySelector('[aria-label="Loading"]')).toBeNull()
  expect(document.querySelector('[data-content]')).not.toBeNull()
})

test('login can resolve without waiting for workspace content', async () => {
  const { document } = await mount(undefined, false, false, true)
  expect(document.body.textContent).toContain('Log in to Codex')
  expect(document.querySelector('[aria-label="Loading"]')).toBeNull()
})

test('a cold entry shows only a loading spinner until readiness is known', async () => {
  const { configSpy } = await mount(undefined, true)
  configSpy.mockReturnValue({
    environment: 'local',
    demo: false,
    experimental: { collab: false },
    demoInstallUrl: ''
  })
  const client = new QueryClient()
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <WorkspaceSetup workspaceId="cold">
        <div>Workspace content</div>
      </WorkspaceSetup>
    </QueryClientProvider>
  )
  client.clear()
  expect(html).toContain('aria-label="Loading"')
  expect(html).not.toContain('Checking your agent')
  expect(html).not.toContain('<h1')
  expect(html).not.toContain('Workspace content')
})

test('expiry hides content and portals, then restores the same local state', async () => {
  const { document, update, click } = await mount({ status: 'available' })
  await click('Draft and attachments')
  await update({ status: 'login-required', reason: 'Expired' })
  expect(document.querySelector<HTMLElement>('[data-content]')?.style.display).toBe('none')
  expect(document.querySelector('#floating-chat')?.closest('[hidden]') !== null).toBe(true)
  expect(
    document.querySelector<HTMLElement>('#floating-chat')?.parentElement?.parentElement?.inert
  ).toBe(true)
  expect(document.body.textContent).toContain('Connect your agent')
  await update({ status: 'available' })
  expect(document.querySelector<HTMLElement>('[data-content]')?.style.display).not.toBe('none')
  expect(document.querySelector('#floating-chat')?.closest('[hidden]')).toBeNull()
  expect(document.body.textContent).toContain('Edited draft and attachments')
  expect(document.querySelector('[aria-label="Workspace setup"]')).toBeNull()
})

test('unavailable and failed status checks show recovery and retry a fresh check', async () => {
  const { document, requests, click, setFail } = await mount({
    status: 'unavailable',
    reason: 'Install Codex in your terminal'
  })
  expect(document.body.textContent).toContain('Install Codex in your terminal')
  expect(document.body.textContent).not.toContain('Log in to Codex')
  setFail(true)
  await click('Try again')
  expect(document.body.textContent).toContain('Could not check your agent')
  setFail(false)
  await click('Try again')
  expect(document.body.textContent).toContain('Install Codex in your terminal')
  expect(requests.filter(path => path.endsWith('/agent?refresh=true')).length).toBe(2)
})

test('global login success rechecks workspace readiness instead of unlocking it', async () => {
  const { document, requests } = await mount(
    { status: 'login-required', reason: 'Workspace credentials need attention' },
    false,
    true
  )
  expect(document.body.textContent).toContain(
    'Signed in to Codex, but this workspace still needs attention'
  )
  expect(document.querySelector('[data-content]')).toBeNull()
  expect(requests).toContain('/api/workspaces/test/agent?refresh=true')
})

test('demo bypasses recovery and does not check auth', async () => {
  const { document, requests } = await mount(undefined, true)
  expect(document.querySelector('[data-content]') !== null).toBe(true)
  expect(requests).toEqual([])
})

test('missing folder offers deletion and returns home after removing the workspace', async () => {
  const { document, client, key, click, requests, destinations } = await mount({
    status: 'unavailable',
    reason: 'Workspace folder not found'
  })
  await act(async () => {
    client.setQueryData<WorkspaceAgent>(key, previous => ({
      ...previous!,
      missingWorkspacePath: '/tmp/missing-workspace'
    }))
    await Bun.sleep(20)
  })
  expect(document.querySelector('h1')?.textContent).toBe('The workspace folder is missing')
  expect(document.body.textContent).not.toContain('/tmp/missing-workspace')
  expect(document.body.textContent).not.toContain('Try again')
  expect(document.body.textContent).not.toContain('Your agent is unavailable')
  expect(document.body.textContent).not.toContain('Log in')
  expect(document.querySelector('img')).toBeNull()
  await click('Delete workspace')
  expect(requests).toContain('/api/workspaces/test')
  expect(destinations).toEqual(['/'])
})
