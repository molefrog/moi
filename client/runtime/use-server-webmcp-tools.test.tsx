import { afterEach, expect, spyOn, test } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'

import type { Tool } from '@/lib/tools'
import { AppContext } from './app-context'
import { WorkspaceEventsClient } from './workspace-events'
import { useServerWebMcpTools } from './use-server-webmcp-tools'

let cleanup = async () => {}
afterEach(() => cleanup())

test('registers active server tools, forwards calls, refreshes and cleans up across navigation', async () => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  const registrations: { tool: Tool; signal: AbortSignal }[] = []
  let registrationError: Error | undefined
  Object.assign(document, {
    modelContext: {
      registerTool(tool: Tool, options: { signal: AbortSignal }) {
        registrations.push({ tool, signal: options.signal })
        if (registrationError) return Promise.reject(registrationError)
      }
    }
  })
  const globals = { window, document, IS_REACT_ACT_ENVIRONMENT: true }
  const previous = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  const requests: { url: string; init?: RequestInit }[] = []
  let resolveCatalog: ((response: Response) => void) | undefined
  const descriptor = {
    name: 'save_order',
    description: 'Save an order',
    inputSchema: { type: 'object' }
  }
  const mock = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const url = String(input)
        requests.push({ url, init })
        if (url.includes('view%3Aslow'))
          return new Promise<Response>(resolve => {
            resolveCatalog = resolve
          })
        return Response.json(init?.method ? { saved: true } : [descriptor])
      },
      { preconnect: fetch.preconnect }
    )
  )
  const events = new WorkspaceEventsClient('ws://unused')
  let reconnect = () => {}
  const reconnectSpy = spyOn(events, 'onReconnect').mockImplementation(listener => {
    reconnect = listener
    return () => {}
  })
  let workspace = 'workspace one',
    target: string | null = 'view:orders',
    revision = '1'
  const errors: string[] = []
  const report = (error: string) => errors.push(error)
  function Content() {
    useServerWebMcpTools(workspace, target, revision, report)
    return null
  }
  const root = createRoot(document.getElementById('root')!)
  const render = async () => {
    await act(async () => {
      root.render(
        <AppContext.Provider value={{ events }}>
          <Content />
        </AppContext.Provider>
      )
    })
  }
  cleanup = async () => {
    await act(async () => root.unmount())
    mock.mockRestore()
    reconnectSpy.mockRestore()
    for (const [key, value] of previous) {
      if (value) Object.defineProperty(globalThis, key, value)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
  await render()
  expect(registrations).toHaveLength(1)
  const invocation = new AbortController()
  expect(await registrations[0]!.tool.execute({ id: 'a' }, { signal: invocation.signal })).toEqual({
    saved: true
  })
  expect(requests[1]).toMatchObject({
    url: '/api/workspaces/workspace%20one/tools/view%3Aorders/save_order',
    init: { method: 'POST', body: '{"id":"a"}', signal: invocation.signal }
  })
  revision = '2'
  await render()
  expect(registrations[0]!.signal.aborted).toBe(true)
  expect(registrations).toHaveLength(2)
  await act(async () => reconnect())
  expect(registrations[1]!.signal.aborted).toBe(true)
  expect(registrations).toHaveLength(3)
  workspace = 'workspace two'
  await render()
  expect(registrations[2]!.signal.aborted).toBe(true)
  expect(requests.at(-1)!.url).toContain('workspace%20two')
  target = null
  await render()
  expect(registrations.every(registration => registration.signal.aborted)).toBe(true)
  target = 'view:slow'
  await render()
  target = null
  await render()
  await act(async () => resolveCatalog?.(Response.json([descriptor])))
  expect(registrations).toHaveLength(4)
  expect(errors).toEqual([])
  registrationError = new Error('Registration failed')
  target = 'view:broken'
  await render()
  expect(registrations.at(-1)!.signal.aborted).toBe(true)
  expect(errors).toEqual(['Server tools: Error: Registration failed'])

  // Unsupported browsers skip discovery entirely and keep the view usable.
  Reflect.deleteProperty(document, 'modelContext')
  const requestCount = requests.length
  target = 'view:unsupported'
  await render()
  expect(requests).toHaveLength(requestCount)
})
