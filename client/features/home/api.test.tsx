import { expect, spyOn, test } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as appConfig from '@/client/api/app-config'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { useWorkspaces } from './api'
import { useSharedWorkspaces } from './shared-workspaces'

test('home lists local and shared workspaces without contacting any owner', async () => {
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(workspaceKeys.layout('visitor'), {
    name: 'Cached owner name',
    remote: { user_id: 'alice', workspace_id: 'board' }
  })
  const calls: string[] = []
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL) => {
        const path = String(input)
        calls.push(path)
        if (path === '/api/workspaces')
          return Response.json([
            { id: 'local', path: '/local', name: 'Local', addedAt: '' },
            {
              id: 'visitor',
              path: '/visitor',
              name: 'board',
              addedAt: '',
              remote: { user_id: 'alice', workspace_id: 'board' }
            }
          ])
        if (path === '/cloud/api/workspaces/shared')
          return Response.json({
            workspaces: [{ id: 'other', owner: { id: 'bob', name: 'Bob' } }]
          })
        // A sleeping/unreachable owner must not hold either list open.
        return new Promise<Response>(() => {})
      },
      { preconnect: fetch.preconnect }
    )
  )
  const configSpy = spyOn(appConfig, 'useAppConfig').mockReturnValue({
    environment: 'cloud',
    demo: false,
    demoInstallUrl: ''
  })
  function Probe() {
    const entries = useWorkspaces()
    const shares = useSharedWorkspaces()
    return (
      <p>
        {entries.data?.map(entry => entry.name).join(',')}|
        {shares.data?.map(share => share.id).join(',')}
      </p>
    )
  }
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>
      )
    )
    for (let i = 0; i < 20 && !document.body.textContent?.includes('other'); i++)
      await act(async () => {
        await Bun.sleep(10)
      })
    expect(document.body.textContent).toContain('Local,Cached owner name|other')
    expect(calls.sort()).toEqual(['/api/workspaces', '/cloud/api/workspaces/shared'])
  } finally {
    await act(async () => root.unmount())
    client.clear()
    fetchSpy.mockRestore()
    configSpy.mockRestore()
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
