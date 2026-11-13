import { afterEach, expect, spyOn, test } from 'bun:test'
import { act, useState, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import * as router from 'wouter'
import { createPortal } from 'react-dom'
import { parseHTML } from 'linkedom'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'

import * as config from '@/client/api/app-config'
import { SidebarLayout } from '@/client/app/shell/sidebar-layout'
import { AccountProvider } from '@/client/features/account/account-provider'
import { workspaceKeys } from '@/client/api/workspace-keys'
import * as events from '@/client/runtime/use-workspace-events'
import type { WorkspaceHarness, HarnessAvailability } from '@/lib/types'
import { createUiStore } from '@/client/store/ui'
import { attachmentKey, liveStore, useLive } from '@/client/features/chat/chat-store'
import { WorkspaceScreen } from '../workspace-screen'
import * as workspaceContent from '../workspace-content'
import * as workspaceFrame from '../workspace-frame'
import { WorkspaceLayoutContext } from '../workspace-layout-context'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import { welcomeNewWorkspace } from './workspace-welcome-state'

type ScreenFixtureProps = {
  workspaceId?: string
  contentPending?: boolean
  chatAvailable?: boolean
}

function ScreenFixture({
  workspaceId = 'test',
  contentPending = false,
  chatAvailable = true
}: ScreenFixtureProps) {
  return (
    <WorkspaceLayoutContext
      value={{
        workspaceId,
        layout: createDefaultWorkspaceLayout(),
        setLayout: () => {},
        name: 'Test workspace',
        cwd: null,
        provider: 'codex',
        apiBase: '/api/workspaces/test',
        chatAvailable,
        isRemote: !chatAvailable,
        isLoading: false
      }}
    >
      <WorkspaceScreen contentPending={contentPending} widgets={[]} views={[]} />
    </WorkspaceLayoutContext>
  )
}

let cleanup = async () => {}
afterEach(() => cleanup())

async function mount(
  status: HarnessAvailability = { status: 'login-required', reason: 'Sign in' },
  demo = false,
  globalConnected = false,
  contentPending = false,
  check?: Promise<HarnessAvailability>,
  environment: 'local' | 'cloud' = 'cloud',
  chatAvailable = true
) {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  const globals = {
    window,
    document,
    HTMLElement: window.HTMLElement,
    getComputedStyle: () => ({ getPropertyValue: () => '640px', fontSize: '16px' }),
    IS_REACT_ACT_ENVIRONMENT: true
  }
  const descriptors = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  notifyManager.setNotifyFunction(callback => act(callback))
  const configSpy = spyOn(config, 'useAppConfig').mockReturnValue({
    environment,
    demo,
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const key = workspaceKeys.harness('test')
  let data: WorkspaceHarness = {
    provider: 'codex',
    availability: status,
    models: [],
    supportsStreaming: true,
    supportsArchiving: true
  }
  let fail = false
  client.setQueryData(key, data)
  let globalAuth = { availability: globalConnected ? { status: 'available' as const } : status }
  if (!check) client.setQueryData(['harness-status'], { codex: globalAuth })
  const requests: string[] = []
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        requests.push(path)
        if (path === '/api/workspaces/test' && init?.method === 'DELETE') {
          return new Response(null, { status: 204 })
        }
        if (path.startsWith('/api/workspaces/test/harness')) {
          if (fail) throw new Error('Offline')
          return Response.json(check ? { ...data, availability: await check } : data)
        }
        if (path.startsWith('/api/harnesses/status')) {
          if (fail) throw new Error('Offline')
          return Response.json({ codex: check ? { availability: await check } : globalAuth })
        }
        throw new Error(`Unexpected request: ${path}`)
      },
      { preconnect: fetch.preconnect }
    )
  )
  function Portal(props: ComponentProps<'div'>) {
    return createPortal(<div {...props} />, document.body)
  }
  const storedValues = new Map<string, string>()
  const useUiStore = createUiStore({
    getItem: key => storedValues.get(key) ?? null,
    setItem: (key, value) => {
      storedValues.set(key, value)
    },
    removeItem: key => {
      storedValues.delete(key)
    }
  })
  useUiStore.getState().setComposerDraft('test', 'Draft')
  const originalAttachments = liveStore.getState().attachments
  function Content() {
    const draft = useUiStore(state => state.composerDrafts.test)
    const attachments = useLive(state => state.attachments[attachmentKey('test', null)])
    const [open, setOpen] = useState(false)
    return (
      <div data-content>
        <button onClick={() => useUiStore.getState().setComposerDraft('test', 'Edited draft')}>
          {draft}
        </button>
        <button
          onClick={() =>
            liveStore.getState().addAttachments('test', null, [
              {
                localId: 'setup-attachment',
                kind: 'text',
                label: 'Attached text',
                text: 'Keep me'
              }
            ])
          }
        >
          Attach text
        </button>
        <span>{attachments?.map(item => item.label).join(', ')}</span>
        <button onClick={() => setOpen(true)}>Open popup</button>
        {open && (
          <Portal>
            <button id="floating-chat">Floating chat</button>
          </Portal>
        )}
      </div>
    )
  }
  const contentSpy = spyOn(workspaceContent, 'WorkspaceContent').mockImplementation(Content)
  const frameSpy = spyOn(workspaceFrame, 'WorkspaceFrame')
  const root = createRoot(document.getElementById('root')!)
  cleanup = async () => {
    await act(async () => {
      root.unmount()
      client.clear()
      await Bun.sleep(0)
    })
    liveStore.setState({ attachments: originalAttachments })
    contentSpy.mockRestore()
    frameSpy.mockRestore()
    fetchSpy.mockRestore()
    configSpy.mockRestore()
    locationSpy.mockRestore()
    eventsSpy.mockRestore()
    notifyManager.setNotifyFunction(callback => callback())
    for (const [key, value] of descriptors) {
      if (value) Object.defineProperty(globalThis, key, value)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
  const render = () => {
    root.render(
      <QueryClientProvider client={client}>
        <ScreenFixture contentPending={contentPending} chatAvailable={chatAvailable} />
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
      globalAuth = { availability }
      await client.cancelQueries({ queryKey: ['harness-status'] })
      client.setQueryData(['harness-status'], { codex: globalAuth })
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
    contentSpy,
    frameSpy,
    update,
    click,
    requests,
    setCheck: (value: Promise<HarnessAvailability>) => {
      check = value
    },
    setFail: (value: boolean) => {
      fail = value
    },
    client,
    key
  }
}

test('signed-out workspace shows only its own login and no workspace content', async () => {
  const { document, contentSpy, frameSpy } = await mount()
  expect(contentSpy).not.toHaveBeenCalled()
  expect(frameSpy).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain('Set up ChatGPT')
  expect(
    document.querySelector('[data-slot="workspace-pane"] [aria-label="Workspace setup"]')
  ).not.toBeNull()
  expect(document.body.textContent).not.toContain('Claude Code')
  expect(document.body.textContent).not.toContain('Workspace settings')
  expect(document.querySelector('[data-content]')).toBeNull()
})

test('fresh readiness from home opens the workspace without another request', async () => {
  const { document, requests } = await mount({ status: 'available' })
  expect(document.querySelector('[data-content]')).not.toBeNull()
  expect(document.querySelector('[role="status"]')).toBeNull()
  expect(requests).toEqual([])
})

test('one loading state waits for workspace content after readiness succeeds', async () => {
  const { document, setContentPending, frameSpy } = await mount(
    { status: 'available' },
    false,
    false,
    true
  )
  expect(document.querySelector('[aria-label="Loading"]')).not.toBeNull()
  expect(document.querySelector('[data-slot="workspace-pane"]')).toBeNull()
  expect(frameSpy).not.toHaveBeenCalled()
  expect(document.querySelector('[aria-label="Workspace setup"]')).toBeNull()
  expect(document.querySelector('[data-content]')).toBeNull()
  await setContentPending(false)
  expect(document.querySelector('[aria-label="Loading"]')).toBeNull()
  expect(document.querySelector('[data-content]')).not.toBeNull()
})

test('login can resolve without waiting for workspace content', async () => {
  const { document } = await mount(undefined, false, false, true)
  expect(document.body.textContent).toContain('Set up ChatGPT')
  expect(document.querySelector('[aria-label="Loading"]')).toBeNull()
})

test('a cold entry shows only a loading spinner until readiness is known', async () => {
  const { configSpy } = await mount(undefined, true)
  configSpy.mockReturnValue({
    environment: 'local',
    demo: false,
    demoInstallUrl: ''
  })
  const client = new QueryClient()
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ScreenFixture workspaceId="cold" />
    </QueryClientProvider>
  )
  client.clear()
  expect(html).not.toContain('data-slot="workspace-pane"')
  expect(html).toContain('aria-label="Loading"')
  expect(html).not.toContain('aria-label="Workspace setup"')
  expect(html).not.toContain('Checking your agent')
  expect(html).not.toContain('<h1')
  expect(html).not.toContain('Workspace content')
})

test('the app sidebar renders known workspaces while the workspace area waits for readiness', async () => {
  await mount(undefined, true)
  const client = new QueryClient()
  client.setQueryData(workspaceKeys.all, [
    {
      id: 'cold',
      name: 'My workspace',
      path: '/tmp/cold',
      type: 'codex',
      addedAt: '2026-01-01T00:00:00Z'
    }
  ])
  try {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <router.Router ssrPath="/workspace/cold">
          <AccountProvider>
            <SidebarLayout>
              <ScreenFixture workspaceId="cold" contentPending />
            </SidebarLayout>
          </AccountProvider>
        </router.Router>
      </QueryClientProvider>
    )
    const { document } = parseHTML(`<html><body>${html}</body></html>`)
    expect(document.querySelector('aside a[aria-label="Home"]')).not.toBeNull()
    expect(document.querySelector('aside a[href="/workspace/cold"]')).not.toBeNull()
    expect(document.querySelector('main [aria-label="Loading"]')).not.toBeNull()
    expect(document.querySelector('main [data-slot="workspace-pane"]')).toBeNull()
    expect(document.querySelector('main [aria-label="Workspace setup"]')).toBeNull()
  } finally {
    client.clear()
  }
})

test('expiry unmounts content and portals, then restores stored drafts and attachments', async () => {
  const { document, update, click } = await mount({ status: 'available' })
  await click('Draft')
  await click('Attach text')
  await click('Open popup')
  const previousContent = document.querySelector('[data-content]')
  expect(document.querySelector('#floating-chat')).not.toBeNull()
  await update({ status: 'login-required', reason: 'Expired' })
  expect(document.querySelector('[data-content]')).toBeNull()
  expect(document.querySelector('#floating-chat')).toBeNull()
  expect(document.body.textContent).toContain('Set up ChatGPT')
  await update({ status: 'available' })
  expect(document.querySelector('[data-content]')).not.toBeNull()
  expect(document.querySelector('[data-content]')).not.toBe(previousContent)
  expect(document.querySelector('#floating-chat')).toBeNull()
  expect(document.body.textContent).toContain('Edited draft')
  expect(document.body.textContent).toContain('Attached text')
  expect(document.querySelector('[aria-label="Workspace setup"]')).toBeNull()
})

test('unavailable and failed status checks show recovery and retry a fresh check', async () => {
  const { document, requests, click, setFail } = await mount({
    status: 'unavailable',
    reason: 'Install Codex in your terminal'
  })
  expect(document.body.textContent).toContain('Install Codex in your terminal')
  expect(document.body.textContent).not.toContain('Set up ChatGPT')
  setFail(true)
  await click('Try again')
  expect(document.body.textContent).toContain('Could not check your agent')
  setFail(false)
  await click('Try again')
  expect(document.body.textContent).toContain('Install Codex in your terminal')
  expect(requests.filter(path => path.includes('/status?refresh=true')).length).toBe(2)
})

test('global login success unlocks workspaces without another workspace auth check', async () => {
  const { document, requests } = await mount(undefined, false, true)
  expect(document.querySelector('[data-content]')).not.toBeNull()
  expect(requests).toEqual([])
})

test('demo reuses cached sign-out without repeating checks', async () => {
  const { document, requests } = await mount(undefined, true)
  expect(document.body.textContent).toContain('Set up ChatGPT')
  expect(requests).toEqual([])
})

test('a ready demo opens the workspace normally', async () => {
  const { document } = await mount({ status: 'available' }, true)
  expect(document.querySelector('[data-content]')).not.toBeNull()
  expect(document.body.textContent).not.toContain('Set up ChatGPT')
})

test('missing folder offers deletion and returns home after removing the workspace', async () => {
  const { document, client, key, click, requests, destinations } = await mount({
    status: 'unavailable',
    reason: 'Workspace folder not found'
  })
  await act(async () => {
    client.setQueryData<WorkspaceHarness>(key, previous => ({
      ...previous!,
      isFolderMissing: true
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

test('cached sign-out waits for verification without briefly showing login', async () => {
  const check = Promise.withResolvers<HarnessAvailability>()
  const { document } = await mount(undefined, false, false, false, check.promise)
  expect(document.querySelector('[aria-label="Loading"]')).not.toBeNull()
  expect(document.querySelector('[aria-label="Workspace setup"]')).toBeNull()
  expect(document.body.textContent).not.toContain('Set up ChatGPT')
  await act(async () => {
    check.resolve({ status: 'available' })
    await Bun.sleep(20)
  })
  expect(document.querySelector('[data-content]')).not.toBeNull()
  expect(document.querySelector('[aria-label="Workspace setup"]')).toBeNull()
})

test('confirmed sign-out shows login and keeps it visible while retrying', async () => {
  const check = Promise.withResolvers<HarnessAvailability>()
  const { document, client, setCheck, frameSpy } = await mount(
    undefined,
    false,
    false,
    false,
    check.promise
  )
  expect(document.body.textContent).not.toContain('Set up ChatGPT')
  expect(document.querySelector('[data-slot="workspace-pane"]')).toBeNull()
  expect(frameSpy).not.toHaveBeenCalled()
  expect(document.querySelector('[aria-label="Workspace setup"]')).toBeNull()
  await act(async () => {
    check.resolve({ status: 'login-required', reason: 'Signed out' })
    await Bun.sleep(20)
  })
  const pane = document.querySelector('[data-slot="workspace-pane"]')
  expect(pane).not.toBeNull()
  expect(frameSpy).not.toHaveBeenCalled()
  expect(pane?.querySelector('[aria-label="Workspace setup"]')).not.toBeNull()
  expect(document.body.textContent).toContain('Set up ChatGPT')
  const retry = Promise.withResolvers<HarnessAvailability>()
  setCheck(retry.promise)
  await act(async () => {
    void client.refetchQueries({ queryKey: ['harness-status'] })
    await Bun.sleep(20)
  })
  expect(document.body.textContent).toContain('Set up ChatGPT')
  expect(document.querySelector('[aria-label="Loading"]')).toBeNull()
  await act(async () => {
    retry.resolve({ status: 'login-required', reason: 'Still signed out' })
    await Bun.sleep(20)
  })
})

test('background checks and network failures preserve a ready workspace', async () => {
  const { document, client, key, setCheck, setFail } = await mount({ status: 'available' })
  const previousContent = document.querySelector('[data-content]')
  const check = Promise.withResolvers<HarnessAvailability>()
  setCheck(check.promise)
  await act(async () => {
    void client.refetchQueries({ queryKey: ['harness-status'] })
    await Bun.sleep(20)
  })
  expect(document.querySelector('[aria-label="Workspace setup"]')).toBeNull()
  expect(document.querySelector('[data-content]')).toBe(previousContent)
  await act(async () => {
    check.resolve({ status: 'available' })
    await Bun.sleep(20)
  })
  setFail(true)
  await act(async () => {
    await client.refetchQueries({ queryKey: key })
    await Bun.sleep(20)
  })
  expect(document.querySelector('[aria-label="Workspace setup"]')).toBeNull()
  expect(document.querySelector('[data-content]')).toBe(previousContent)
})

test('an older response cannot overwrite a newer auth event and reopen login', async () => {
  const check = Promise.withResolvers<HarnessAvailability>()
  const { document, update } = await mount(undefined, false, false, false, check.promise)
  await update({ status: 'available' })
  expect(document.querySelector('[aria-label="Workspace setup"]')).toBeNull()
  await act(async () => {
    check.resolve({ status: 'login-required', reason: 'Old snapshot' })
    await Bun.sleep(20)
  })
  expect(document.querySelector('[aria-label="Workspace setup"]')).toBeNull()
  expect(document.querySelector('[data-content]')).not.toBeNull()
})

async function finishWelcome() {
  await act(async () => {
    await Bun.sleep(3050)
  })
}

function chatHidden(document: Document) {
  return document.querySelector('[data-content]') === null
}

test('creation shows welcome for three seconds before revealing a ready workspace and chat', async () => {
  welcomeNewWorkspace('test')
  const { document } = await mount({ status: 'available' })
  expect(document.querySelector('[aria-label="Workspace welcome"]')).not.toBeNull()
  expect(document.querySelector('[data-content]')).toBeNull()
  expect(chatHidden(document)).toBe(true)
  expect(document.querySelector('[aria-label="Workspace welcome"] svg')).not.toBeNull()
  await act(async () => {
    await Bun.sleep(2100)
  })
  expect(document.querySelector('[aria-label="Workspace welcome"]')).not.toBeNull()
  expect(document.querySelector('[aria-label="Workspace welcome"] svg')).toBeNull()
  await act(async () => {
    await Bun.sleep(1100)
  })
  expect(document.querySelector('[aria-label="Workspace welcome"]')).toBeNull()
  expect(document.querySelector('[data-content]')).not.toBeNull()
  expect(chatHidden(document)).toBe(false)
})

test('welcome precedes login and chat stays hidden until login is verified', async () => {
  welcomeNewWorkspace('test')
  const { document, update, requests } = await mount()
  expect(document.querySelector('[aria-label="Workspace welcome"]')).not.toBeNull()
  expect(document.body.textContent).not.toContain('Set up ChatGPT')
  expect(requests).toEqual([])
  await finishWelcome()
  expect(document.body.textContent).toContain('Set up ChatGPT')
  expect(chatHidden(document)).toBe(true)
  await update({ status: 'available' })
  expect(document.querySelector('[data-content]')).not.toBeNull()
  expect(chatHidden(document)).toBe(false)
})

test('slow content keeps workspace content unmounted until ready', async () => {
  welcomeNewWorkspace('test')
  const { document, setContentPending } = await mount({ status: 'available' }, false, false, true)
  await finishWelcome()
  expect(document.querySelector('[aria-label="Workspace welcome"]')).toBeNull()
  expect(document.querySelector('[role="status"]')).not.toBeNull()
  expect(chatHidden(document)).toBe(true)
  await setContentPending(false)
  expect(chatHidden(document)).toBe(false)
  expect(document.querySelector('[data-content]')).not.toBeNull()
  await setContentPending(true)
  expect(chatHidden(document)).toBe(true)
})

test('leaving during welcome consumes the handoff and cancels its timer', async () => {
  welcomeNewWorkspace('test')
  const first = await mount({ status: 'available' })
  expect(first.document.querySelector('[aria-label="Workspace welcome"]')).not.toBeNull()
  await cleanup()
  const second = await mount({ status: 'available' })
  expect(second.document.querySelector('[aria-label="Workspace welcome"]')).toBeNull()
  expect(chatHidden(second.document)).toBe(false)
  await finishWelcome()
  expect(second.document.querySelector('[data-content]')).not.toBeNull()
  expect(chatHidden(second.document)).toBe(false)
})

test('welcome finishes while readiness is pending without opening chat', async () => {
  welcomeNewWorkspace('test')
  let resolve!: (status: HarnessAvailability) => void
  const check = new Promise<HarnessAvailability>(done => {
    resolve = done
  })
  const { document } = await mount(
    { status: 'login-required', reason: 'Sign in' },
    false,
    false,
    false,
    check
  )
  await finishWelcome()
  expect(document.querySelector('[role="status"]')).not.toBeNull()
  expect(chatHidden(document)).toBe(true)
  await act(async () => {
    resolve({ status: 'available' })
    await Bun.sleep(30)
  })
  expect(document.querySelector('[data-content]')).not.toBeNull()
  expect(chatHidden(document)).toBe(false)
})

test('unavailable agent replaces welcome and keeps chat hidden', async () => {
  welcomeNewWorkspace('test')
  const { document } = await mount({ status: 'unavailable', reason: 'Agent is missing' })
  expect(document.querySelector('[aria-label="Workspace welcome"]')).not.toBeNull()
  await finishWelcome()
  expect(document.body.textContent).toContain('Agent is missing')
  expect(chatHidden(document)).toBe(true)
  expect(document.querySelector('[data-content]')).toBeNull()
})

test('missing local agents reuse install while cloud keeps manual recovery', async () => {
  const missing = {
    status: 'unavailable',
    code: 'not-installed',
    reason: 'Install instructions'
  } as const
  const local = await mount(missing, false, false, false, undefined, 'local')
  expect(local.document.body.textContent).toContain('Install ChatGPT')
  expect(local.document.body.textContent).not.toContain('Check again')
  await cleanup()
  const cloud = await mount(missing)
  expect(cloud.document.body.textContent).toContain('Install instructions')
  expect(cloud.document.body.textContent).not.toContain('Install ChatGPT')
})

test('chat availability from context skips agent setup while preserving content loading', async () => {
  const { document, setContentPending } = await mount(
    { status: 'login-required', reason: 'Sign in' },
    false,
    false,
    true,
    undefined,
    'cloud',
    false
  )
  expect(document.querySelector('[aria-label="Loading"]')).not.toBeNull()
  expect(document.body.textContent).not.toContain('Set up ChatGPT')
  await setContentPending(false)
  expect(document.querySelector('[data-content]')).not.toBeNull()
  expect(document.querySelector('[aria-label="Loading"]')).toBeNull()
})
