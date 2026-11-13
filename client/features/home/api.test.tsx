import { expect, spyOn, test } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as appConfig from '@/client/api/app-config'
import { useWorkspaces, useWorkspaceMetadata } from './api'
import { useSharedWorkspaces, homeWorkspaces } from './shared-workspaces'

test.each(['ready', 'failed', 'slow'] as const)(
  'home deduplicates owner requests and keeps cards available (%s)',
  async state => {
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
    let wakeOwner: (response: Response) => void = () => {}
    const sleepingOwner = new Promise<Response>(resolve => {
      wakeOwner = resolve
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
              workspaces: [
                { id: 'board', owner: { id: 'alice', name: 'Alice' } },
                { id: 'other', owner: { id: 'bob', name: 'Bob' } }
              ]
            })
          if (path === '/api/workspaces/alice:board') {
            if (state === 'slow') return sleepingOwner
            if (state === 'failed') return new Response('Owner unavailable', { status: 503 })
            return Response.json({ name: 'Fresh owner name', isRemote: false })
          }
          if (path === '/api/workspaces/bob:other')
            return Response.json({ name: 'Other owner', isRemote: false })
          throw new Error(`Unexpected request: ${path}`)
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
      const cards = useWorkspaceMetadata(homeWorkspaces(entries.data ?? [], shares.data ?? []))
      // Sidebar and home observe the same owner without issuing duplicate requests.
      useWorkspaceMetadata(entries.data ?? [])
      return <p>{cards.map(card => card.name).join(',')}</p>
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
      for (let i = 0; i < 20 && !document.body.textContent?.includes('Other owner'); i++)
        await act(async () => {
          await Bun.sleep(10)
        })
      expect(document.body.textContent).toContain(
        state === 'ready' ? 'Other owner,Local,Fresh owner name' : 'Other owner,Local,board'
      )
      if (state === 'slow') {
        wakeOwner(Response.json({ name: 'Awake owner', isRemote: false }))
        for (let i = 0; i < 20 && !document.body.textContent?.includes('Awake owner'); i++)
          await act(async () => {
            await Bun.sleep(10)
          })
        expect(document.body.textContent).toContain('Other owner,Local,Awake owner')
      }
      expect(calls.sort()).toEqual([
        '/api/workspaces',
        '/api/workspaces/alice:board',
        '/api/workspaces/bob:other',
        '/cloud/api/workspaces/shared'
      ])
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
  }
)
