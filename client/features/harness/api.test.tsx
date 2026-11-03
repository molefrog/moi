import { afterEach, expect, spyOn, test } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import {
  focusManager,
  notifyManager,
  QueryClient,
  QueryClientProvider
} from '@tanstack/react-query'
import { AppProvider } from '@/client/app/app-provider'
import { WorkspaceEventsClient } from '@/client/runtime/workspace-events'
import type { WorkspaceEventHandler } from '@/client/runtime/workspace-events'
import { useWorkspaceHarness } from '@/client/features/workspace/api'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { useHarnessStatus } from './api'

let cleanup = async () => {}
afterEach(() => cleanup())

test('workspaces and onboarding share status; auth events and harness switches update every consumer', async () => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  const globals = {
    window,
    document,
    location: { protocol: 'http:', host: 'localhost' },
    IS_REACT_ACT_ENVIRONMENT: true
  }
  const descriptors = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  notifyManager.setNotifyFunction(callback => act(callback))
  const handlers = new Set<WorkspaceEventHandler>()
  const connect = spyOn(WorkspaceEventsClient.prototype, 'connect').mockImplementation(() => {})
  const close = spyOn(WorkspaceEventsClient.prototype, 'close').mockImplementation(() => {})
  const subscription = spyOn(WorkspaceEventsClient.prototype, 'subscribe').mockImplementation(
    handler => {
      handlers.add(handler)
      return () => {
        handlers.delete(handler)
      }
    }
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const requests: string[] = []
  let provider = 'claude-code'
  let signedOut = false
  let pending: Promise<Response> | undefined
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL) => {
        const path = String(input)
        requests.push(path)
        if (path.includes('/harnesses/')) {
          if (pending) return pending
          return Response.json({
            'claude-code': { availability: { status: signedOut ? 'login-required' : 'available' } },
            codex: { availability: { status: 'login-required' } }
          })
        }
        return Response.json({
          provider,
          availability: { status: 'available' },
          models: [],
          supportsStreaming: true
        })
      },
      { preconnect: fetch.preconnect }
    )
  )
  const root = createRoot(document.getElementById('root')!)
  cleanup = async () => {
    await act(async () => root.unmount())
    client.clear()
    focusManager.setFocused(undefined)
    subscription.mockRestore()
    connect.mockRestore()
    close.mockRestore()
    fetchSpy.mockRestore()
    notifyManager.setNotifyFunction(callback => callback())
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
  function Onboarding() {
    const status = useHarnessStatus('claude-code')
    return <span data-onboarding>{status.data?.availability.status}</span>
  }
  function Workspace({ id }: WorkspaceProps) {
    const workspace = useWorkspaceHarness(id)
    const status = useHarnessStatus(workspace.data?.provider)
    return (
      <span data-workspace>
        {workspace.data?.provider}:{status.data?.availability.status}
      </span>
    )
  }
  async function render(id: string) {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <AppProvider>
            <Onboarding />
            <Workspace key={id} id={id} />
          </AppProvider>
        </QueryClientProvider>
      )
      await Bun.sleep(20)
    })
    await act(async () => {
      await Bun.sleep(20)
    })
  }
  await render('one')
  await render('two')
  await render('one')
  expect(requests.filter(path => path.includes('/harnesses/'))).toHaveLength(1)
  expect(document.querySelector('[data-workspace]')?.textContent).toBe('claude-code:available')

  const old = Promise.withResolvers<Response>()
  pending = old.promise
  await act(async () => {
    void client.refetchQueries({ queryKey: ['harness-status'] })
    await Bun.sleep(10)
  })
  await act(async () => {
    for (const handler of handlers)
      handler({
        type: 'harness-status:changed',
        harness: 'claude-code',
        status: { availability: { status: 'login-required', reason: 'Signed out' } }
      })
    old.resolve(
      Response.json({
        'claude-code': { availability: { status: 'available' } },
        codex: { availability: { status: 'available' } }
      })
    )
    await Bun.sleep(20)
  })
  expect(document.querySelector('[data-onboarding]')?.textContent).toBe('login-required')
  expect(document.querySelector('[data-workspace]')?.textContent).toBe('claude-code:login-required')
  pending = undefined
  await act(async () => {
    for (const handler of handlers)
      handler({
        type: 'harness-status:changed',
        harness: 'claude-code',
        status: { availability: { status: 'available' } }
      })
    await Bun.sleep(20)
  })
  expect(document.querySelector('[data-onboarding]')?.textContent).toBe('available')
  expect(document.querySelector('[data-workspace]')?.textContent).toBe('claude-code:available')
  signedOut = true
  await act(async () => {
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await Bun.sleep(20)
  })
  expect(document.querySelector('[data-onboarding]')?.textContent).toBe('login-required')
  expect(document.querySelector('[data-workspace]')?.textContent).toBe('claude-code:login-required')
  signedOut = false
  await act(async () => {
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await Bun.sleep(20)
  })
  const readsBeforeSwitch = requests.filter(path => path.includes('/harnesses/')).length
  provider = 'codex'
  await act(async () => {
    await client.resetQueries({ queryKey: workspaceKeys.harness('one') })
    await Bun.sleep(20)
  })
  await act(async () => {
    await Bun.sleep(20)
  })
  expect(requests.filter(path => path.includes('/harnesses/'))).toHaveLength(readsBeforeSwitch)
  expect(document.querySelector('[data-workspace]')?.textContent).toBe('codex:login-required')
  expect(document.querySelector('[data-onboarding]')?.textContent).toBe('available')
})

type WorkspaceProps = { id: string }
