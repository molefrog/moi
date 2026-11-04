import { afterEach, expect, spyOn, test } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import * as config from '@/client/api/app-config'
import { OnboardingPage } from './onboarding-page'

let cleanup = async () => {}
afterEach(async () => cleanup())
async function mount(
  showOnboarding = true,
  local = false,
  connected = true,
  demo = false,
  createResponse?: () => Promise<Response>,
  discoveryResponse?: () => Promise<Response>,
  scratchResponses?: {
    create?: () => Promise<Response>
    save?: () => Response
    workspaces?: () => Response
    installed?: boolean
    install?: () => Promise<Response>
    auth?: () => Response
  }
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
  const configSpy = spyOn(config, 'useAppConfig').mockReturnValue({
    environment: local ? 'local' : 'cloud',
    demo,
    collab: false,
    demoInstallUrl: '/'
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  const location = memoryLocation({ path: '/onboarding', record: true })
  const calls: { path: string; body: Record<string, unknown> }[] = []
  let loginStarted = false
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
        if (init?.method === 'POST' || init?.method === 'PATCH') calls.push({ path, body })
        if (path === '/api/settings') {
          if (init?.method === 'PATCH' && scratchResponses?.save) return scratchResponses.save()
          if (init?.method === 'PATCH') showOnboarding = body.showOnboarding === true
          return Response.json({ autoUpdateSkills: false, showOnboarding })
        }
        if (path === '/api/workspaces') return scratchResponses?.workspaces?.() ?? Response.json([])
        if (path === '/api/workspaces/create' && init?.method === 'POST')
          return scratchResponses?.create
            ? scratchResponses.create()
            : Response.json({ id: 'empty-workspace', path: '/tmp/My workspace', type: body.type })
        if (path.endsWith('/auth/login')) {
          loginStarted = true
          return Response.json({ id: 'test-login', url: 'https://example.com/login' })
        }
        if (path.endsWith('/auth/install')) return scratchResponses!.install!()
        if (path.startsWith('/api/harnesses/status')) {
          const response =
            scratchResponses?.auth?.() ??
            Response.json({
              login: loginStarted
                ? { state: 'pending', id: 'test-login', url: 'https://example.com/login' }
                : undefined,
              availability:
                scratchResponses?.installed === false
                  ? { status: 'unavailable', code: 'not-installed' }
                  : { status: connected ? 'available' : 'login-required' }
            })
          const status = await response.json()
          return Response.json({ 'claude-code': status, codex: status })
        }
        if (path === '/api/onboarding/discover' && discoveryResponse) return discoveryResponse()
        if (path === '/api/onboarding/discover')
          return Response.json({
            status: 'done',
            ideas: ['Reading list', 'Planner', 'Tracker'].map((name, index) => ({
              id: crypto.randomUUID(),
              name,
              description: 'A useful project',
              icon: 'book',
              theme: {
                font: ['serif', 'mono', 'rounded'][index],
                color: ['paper', 'sky', 'mint'][index]
              },
              views: [
                {
                  name: 'Library',
                  icon: 'book' as const,
                  description: 'Search and organize saved articles',
                  features: ['Search articles']
                },
                {
                  name: 'Notes',
                  icon: 'file' as const,
                  description: 'Keep your takeaways',
                  features: ['Write notes']
                },
                {
                  name: 'History',
                  icon: 'calendar' as const,
                  description: 'Finished articles',
                  features: ['Review past reading']
                }
              ],
              widgets: [
                { name: 'Summary', description: 'Overview', features: ['Show saved items'] }
              ]
            }))
          })
        if (path === '/api/onboarding/create')
          return createResponse
            ? await createResponse()
            : Response.json({
                status: 'done',
                workspaceId: 'created-workspace',
                sessionId: 'first-chat'
              })
        if (path === '/api/onboarding/cancel') return Response.json({ status: 'done' })
        throw new Error(`Unexpected request ${path}`)
      },
      { preconnect: fetch.preconnect }
    )
  )
  notifyManager.setScheduler(callback => callback())
  const root = createRoot(document.getElementById('root')!)
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Router hook={location.hook}>
          <OnboardingPage />
        </Router>
      </QueryClientProvider>
    )
    await Bun.sleep(10)
  })
  async function settle() {
    await act(async () => {
      await Bun.sleep(15)
    })
  }
  async function click(text: string) {
    const button = [...document.querySelectorAll('button')].find(
      button => (button.getAttribute('aria-label') ?? button.textContent) === text
    )
    expect(button).toBeTruthy()
    await act(async () => {
      button!.click()
    })
    await settle()
  }
  cleanup = async () => {
    await act(async () => root.unmount())
    client.clear()
    configSpy.mockRestore()
    fetchSpy.mockRestore()
    notifyManager.setScheduler(callback => setTimeout(callback, 0))
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
  await settle()
  return {
    document,
    location,
    calls,
    click,
    settle,
    refreshAuth: () => client.refetchQueries({ queryKey: ['harness-status'] })
  }
}

test('agent selection and connection are required; building opens the workspace automatically', async () => {
  const page = await mount()
  expect(page.document.body.textContent).toContain('Choose your agent')
  expect(
    [...page.document.querySelectorAll('button')].some(
      button => button.textContent === 'I’ll start on my own'
    )
  ).toBe(false)
  expect(
    [...page.document.querySelectorAll('button')].some(button => button.textContent === 'Log in')
  ).toBe(false)
  expect(page.document.querySelector('[aria-pressed]')).toBeNull()
  await page.click('ChatGPTOpenAI')
  expect(page.document.body.textContent).toContain('Choose a starting point')
  await page.click('Find ideas')
  expect(page.calls.find(call => call.path.endsWith('/discover'))?.body.harness).toBe('codex')
  expect(page.document.querySelectorAll('button[aria-label^="Build "]')).toHaveLength(3)
  const card = page.document.querySelector('button[aria-label="Build Reading list"]')!
  expect(card.textContent).toContain('Reading list')
  expect(card.textContent).toContain('A useful project')
  expect(card.textContent).not.toContain('Search and organize saved articles')
  expect(card.textContent).not.toContain('Show saved items')
  expect([...card.querySelectorAll('[data-slot="badge"]')].map(item => item.textContent)).toEqual([
    'Library',
    'Notes',
    'History'
  ])
  expect(card.querySelector('ul[aria-label="Widgets"]')).toBeNull()
  expect(card.querySelectorAll('[data-slot="badge"] svg')).toHaveLength(3)
  expect(card.textContent).not.toContain('Summary')
  expect(page.document.querySelectorAll('[data-slot="badge"]')).toHaveLength(9)
  await page.click('Build Reading list')
  expect(page.location.history?.at(-1)).toBe('/workspace/created-workspace/overview')
  expect(page.calls.find(call => call.path === '/api/settings')?.body).toEqual({
    showOnboarding: false
  })
})
for (const [agent, type] of [
  ['ClaudeAnthropic', 'claude-code'],
  ['ChatGPTOpenAI', 'codex']
]) {
  test(`skip the onboarding creates an empty ${type} workspace and opens Overview`, async () => {
    const page = await mount()
    await page.click(agent!)
    await page.click('I’ll start on my own')
    expect(page.location.history?.at(-1)).toBe('/workspace/empty-workspace/overview')
    expect(page.calls).toEqual([
      { path: '/api/workspaces/create', body: { type } },
      { path: '/api/settings', body: { showOnboarding: false } }
    ])
  })
}
test('reopening onboarding starts with agent selection again', async () => {
  const first = await mount()
  await first.click('ClaudeAnthropic')
  await first.click('Find ideas')
  expect(first.document.body.textContent).toContain('Choose a starting point')
  await cleanup()
  const reopened = await mount()
  expect(reopened.document.body.textContent).toContain('Choose your agent')
  expect(reopened.calls).toHaveLength(0)
})
test('skipping with existing workspaces completes onboarding and returns home', async () => {
  const page = await mount(true, false, true, false, undefined, undefined, {
    workspaces: () => Response.json([{ id: 'existing-workspace' }])
  })
  await page.click('ChatGPTOpenAI')
  await page.click('Find ideas')
  await page.click('I’ll start on my own')
  expect(page.location.history?.at(-1)).toBe('/')
  expect(page.calls.some(call => call.path === '/api/onboarding/cancel')).toBe(true)
  expect(page.calls.some(call => call.path === '/api/workspaces/create')).toBe(false)
  expect(page.calls.filter(call => call.path === '/api/settings')).toEqual([
    { path: '/api/settings', body: { showOnboarding: false } }
  ])
})

test('a failed workspace lookup keeps onboarding open and can be retried', async () => {
  let attempts = 0
  const page = await mount(true, false, true, false, undefined, undefined, {
    workspaces: () =>
      ++attempts === 1
        ? new Response('Could not load workspaces', { status: 500 })
        : Response.json([{ id: 'existing-workspace' }])
  })
  await page.click('ChatGPTOpenAI')
  await page.click('I’ll start on my own')
  expect(page.document.querySelector('[role="alert"]')?.textContent).toBe(
    'Could not load workspaces'
  )
  expect(page.location.history?.at(-1)).toBe('/onboarding')
  expect(page.calls).toHaveLength(0)
  await page.click('I’ll start on my own')
  expect(page.location.history?.at(-1)).toBe('/')
  expect(page.calls).toEqual([{ path: '/api/settings', body: { showOnboarding: false } }])
})
test('connection has no Skip or Switch agent action', async () => {
  const page = await mount(true, false, false)
  await page.click('ClaudeAnthropic')
  expect(
    [...page.document.querySelectorAll('button')].some(
      button => button.textContent === 'I’ll start on my own'
    )
  ).toBe(false)
  expect(page.document.body.textContent).toContain('Set up Claude')
  expect(
    [...page.document.querySelectorAll('button')].some(
      button => button.textContent === 'Switch agent'
    )
  ).toBe(false)
})
test('completed visits redirect home and local installs show onboarding', async () => {
  const page = await mount(false)
  expect(page.location.history?.at(-1)).toBe('/')
  await cleanup()
  const local = await mount(true, true)
  expect(local.document.body.textContent).toContain('Choose your agent')
})

test('demo still bypasses onboarding until signup', async () => {
  const page = await mount(true, false, true, true)
  expect(page.location.history?.at(-1)).toBe('/')
})

test('creation keeps the card slots and blocks duplicate clicks until automatic navigation', async () => {
  const pending = Promise.withResolvers<Response>()
  const page = await mount(true, false, true, false, () => pending.promise)
  await page.click('ClaudeAnthropic')
  await page.click('Find ideas')
  await page.click('Build Reading list')
  expect(page.document.querySelectorAll('button[aria-label^="Build "]')).toHaveLength(3)
  expect(page.document.body.textContent).not.toContain('Creating workspace…')
  expect(
    page.document
      .querySelector('button[aria-label="Build Reading list"]')
      ?.getAttribute('aria-busy')
  ).toBe('true')
  expect([...page.document.querySelectorAll('button')].every(button => button.disabled)).toBe(true)
  expect(page.location.history?.at(-1)).toBe('/onboarding')
  expect(page.calls.some(call => call.path === '/api/settings')).toBe(false)
  await act(async () => {
    pending.resolve(Response.json({ status: 'done', workspaceId: 'created-workspace' }))
    await Bun.sleep(20)
  })
  await page.settle()
  expect(page.location.history?.at(-1)).toBe('/workspace/created-workspace/overview')
  expect(page.calls.filter(call => call.path === '/api/onboarding/create')).toHaveLength(1)
  expect(page.calls.filter(call => call.path === '/api/settings')).toHaveLength(1)
})

test('creation failures keep the ideas and retry the same operation', async () => {
  let attempts = 0
  const page = await mount(true, false, true, false, async () => {
    attempts++
    return Response.json(
      attempts === 1
        ? { status: 'failed', error: 'Connection failed' }
        : { status: 'done', workspaceId: 'created-workspace' }
    )
  })
  await page.click('ClaudeAnthropic')
  await page.click('Find ideas')
  await page.click('Build Reading list')
  expect(page.document.querySelectorAll('button[aria-label^="Build "]')).toHaveLength(3)
  expect(page.document.querySelector('[role="alert"]')?.textContent).toBe('Connection failed')
  expect(page.calls.some(call => call.path === '/api/settings')).toBe(false)
  await page.click('Try again')
  expect(page.location.history?.at(-1)).toBe('/workspace/created-workspace/overview')
  const requests = page.calls.filter(call => call.path === '/api/onboarding/create')
  expect(requests).toHaveLength(2)
  expect(requests[1].body.operationId).toBe(requests[0].body.operationId)
})

test('discovery shows reported progress and can be cancelled to skip the onboarding', async () => {
  const pending = Promise.withResolvers<Response>()
  const page = await mount(true, false, true, false, undefined, () => pending.promise)
  await page.click('ChatGPTOpenAI')
  await page.click('Find ideas')
  expect(page.document.querySelector('h1')?.textContent).toBe('Choose a starting point')
  expect(page.document.querySelector('[role="status"]')?.textContent).toBe('Taking a first look…')
  await act(async () => {
    pending.resolve(
      Response.json({ status: 'running', progress: { message: 'Reading recent email' } })
    )
  })
  await page.settle()
  expect(page.document.querySelector('[role="status"]')?.textContent).toContain(
    'Reading recent email'
  )
  expect(page.document.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe(
    'Finding ideas'
  )
  expect(
    [...page.document.querySelectorAll('button')].some(
      button => button.textContent === 'Find ideas'
    )
  ).toBe(false)
  await page.click('I’ll start on my own')
  expect(page.calls.some(call => call.path === '/api/onboarding/cancel')).toBe(true)
  expect(page.location.history?.at(-1)).toBe('/workspace/empty-workspace/overview')
})

test('starting from scratch blocks other actions until creation finishes', async () => {
  const pending = Promise.withResolvers<Response>()
  const page = await mount(true, false, true, false, undefined, undefined, {
    create: () => pending.promise
  })
  await page.click('ChatGPTOpenAI')
  await page.click('I’ll start on my own')
  expect([...page.document.querySelectorAll('button')].every(button => button.disabled)).toBe(true)
  await page.click('Creating workspace…')
  expect(page.calls.filter(call => call.path === '/api/workspaces/create')).toHaveLength(1)
  expect(page.calls.some(call => call.path === '/api/settings')).toBe(false)
  await act(async () => {
    pending.resolve(Response.json({ id: 'empty-workspace' }))
    await Bun.sleep(20)
  })
  await page.settle()
  expect(page.location.history?.at(-1)).toBe('/workspace/empty-workspace/overview')
})

test('empty workspace creation failure keeps onboarding open and can be retried', async () => {
  let attempts = 0
  const page = await mount(true, false, true, false, undefined, undefined, {
    create: async () =>
      ++attempts === 1
        ? new Response('Could not create workspace', { status: 500 })
        : Response.json({ id: 'empty-workspace' })
  })
  await page.click('ClaudeAnthropic')
  await page.click('I’ll start on my own')
  expect(page.document.querySelector('[role="alert"]')?.textContent).toBe(
    'Could not create workspace'
  )
  expect(page.calls.some(call => call.path === '/api/settings')).toBe(false)
  await page.click('I’ll start on my own')
  expect(page.location.history?.at(-1)).toBe('/workspace/empty-workspace/overview')
})

test('retrying onboarding completion reuses the empty workspace', async () => {
  let attempts = 0
  const page = await mount(true, false, true, false, undefined, undefined, {
    save: () =>
      ++attempts === 1
        ? new Response('Could not save settings', { status: 500 })
        : Response.json({ showOnboarding: false })
  })
  await page.click('ClaudeAnthropic')
  await page.click('I’ll start on my own')
  expect(page.document.querySelector('[role="alert"]')?.textContent).toBe('Could not save settings')
  await page.click('I’ll start on my own')
  expect(page.calls.filter(call => call.path === '/api/workspaces/create')).toHaveLength(1)
  expect(page.location.history?.at(-1)).toBe('/workspace/empty-workspace/overview')
})

test('a missing local agent installs and starts login with one click', async () => {
  let finish!: (response: Response) => void
  let loginVisible = false
  const setup = {
    installed: false,
    auth: () =>
      Response.json({
        availability: setup.installed
          ? { status: 'login-required' }
          : { status: 'unavailable', code: 'not-installed' },
        login: loginVisible
          ? { state: 'pending', id: 'test-login', url: 'https://example.com/login' }
          : undefined
      }),
    install: () =>
      new Promise<Response>(resolve => {
        finish = resolve
      })
  }
  const page = await mount(true, true, false, false, undefined, undefined, setup)
  await page.click('ChatGPTOpenAI')
  expect(page.document.body.textContent).toContain('isn’t installed on your computer yet')
  await page.click('Install ChatGPT')
  expect(page.document.body.textContent).toContain('Installing…')
  expect(page.document.querySelector('button')?.disabled).toBe(true)
  setup.installed = true
  await act(async () => {
    finish(Response.json({ ok: true }))
  })
  await page.settle()
  // The final refresh can still carry the old status. Stay busy until polling catches up.
  expect(page.document.body.textContent).toContain('Installing…')
  expect(page.document.querySelector('button')?.disabled).toBe(true)
  loginVisible = true
  await act(async () => {
    await page.refreshAuth()
  })
  await page.settle()
  expect(page.document.body.textContent).toContain('Set up ChatGPT')
  expect(page.document.body.textContent).toContain('Open ChatGPT')
  expect(page.calls.filter(call => call.path.endsWith('/auth/login'))).toHaveLength(1)
  expect(page.calls.filter(call => call.path.endsWith('/auth/install'))).toHaveLength(1)
})

test('a failed status check after installation does not start login', async () => {
  let installed = false
  const page = await mount(true, true, false, false, undefined, undefined, {
    installed: false,
    install: async () => {
      installed = true
      return Response.json({ ok: true })
    },
    auth: () => {
      if (installed) throw new Error('Could not check agent status')
      return Response.json({ availability: { status: 'unavailable', code: 'not-installed' } })
    }
  })
  await page.click('ChatGPTOpenAI')
  await page.click('Install ChatGPT')
  expect(page.document.body.textContent).toContain('Could not check agent status')
  expect(page.calls.some(call => call.path.endsWith('/auth/login'))).toBe(false)
})
