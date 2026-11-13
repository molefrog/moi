import { seedWorkspaceInfo } from '@/client/features/workspace/workspace-test-utils'
import { expect, spyOn, test } from 'bun:test'
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSaveLayout, useWorkspaceLayout, type WorkspaceLayoutMutation } from './api'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'

test('Cloud layout preserves routing from the visitor info response', async () => {
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
  const writes: { url: string; body: Record<string, unknown> }[] = []
  const remote = { user_id: 'alice', workspace_id: 'board' }
  const owner = {
    ...createDefaultWorkspaceLayout(),
    name: 'Owner board',
    apiBase: '/api/workspaces/board',
    isRemote: false,
    selectedModel: 'owner-model'
  }
  const visitor = {
    version: 2,
    remote,
    apiBase: '/api/workspaces/alice:board',
    isRemote: true,
    layoutMode: 'fullscreen',
    tabs: { open: ['scratchpad'], active: 'scratchpad' },
    cwd: '/visitor'
  }
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === 'PUT') {
          writes.push({ url, body: JSON.parse(String(init.body)) })
          return new Response(null, { status: 204 })
        }
        expect(['/api/workspaces/visitor', '/api/workspaces/alice:board']).toContain(url)
        return Response.json(url.endsWith('/visitor') ? visitor : owner)
      },
      { preconnect: fetch.preconnect }
    )
  )
  let loaded: ReturnType<typeof useWorkspaceLayout>['data']
  let save: (value: WorkspaceLayoutMutation) => Promise<void> = async () => {}
  function Probe() {
    const layout = useWorkspaceLayout('visitor')
    const mutation = useSaveLayout('visitor')
    useEffect(() => {
      loaded = layout.data
      save = mutation.mutateAsync
    }, [layout.data, mutation.mutateAsync])
    return null
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
    for (let i = 0; !loaded && i < 20; i++)
      await act(async () => {
        await Bun.sleep(10)
      })
    expect(loaded).toMatchObject({
      name: 'Owner board',
      apiBase: '/api/workspaces/alice:board',
      isRemote: true,
      remote,
      cwd: '/visitor',
      layoutMode: 'fullscreen',
      tabs: createDefaultWorkspaceLayout().tabs
    })
    expect(loaded?.selectedModel).toBeUndefined()
    expect(
      client
        .getQueryCache()
        .getAll()
        .map(query => query.queryKey)
    ).toEqual([['workspaces', 'layout', 'visitor']])
    await act(async () => {
      await save({
        ...owner,
        tabs: visitor.tabs as WorkspaceLayoutMutation['tabs'],
        saveShared: false
      })
    })
    expect(writes).toEqual([])
    writes.length = 0
    await act(async () => {
      await save({ ...owner, saveShared: true })
    })
    expect(writes.map(write => write.url)).toEqual(['/api/workspaces/alice:board'])
    for (const field of ['tabs', 'layoutMode', 'selectedModel', 'saveShared', 'remote'])
      expect(writes[0]!.body).not.toHaveProperty(field)
  } finally {
    await act(async () => root.unmount())
    client.clear()
    await act(async () => {
      await Bun.sleep(20)
    })
    fetchSpy.mockRestore()
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})

test('unknown workspace identity cannot silently select the visitor API', async () => {
  const { ownerApiBase } = await import('./remote')
  const { queryClient } = await import('@/client/api/query-client')
  const { workspaceKeys } = await import('@/client/api/workspace-keys')
  const id = 'cold-remote'
  expect(() => ownerApiBase(id)).toThrow('Workspace identity is not loaded')
  seedWorkspaceInfo(id, { user_id: 'alice', workspace_id: 'board' })
  expect(ownerApiBase(id)).toBe('/api/workspaces/alice:board')
  queryClient.removeQueries({ queryKey: workspaceKeys.layout(id) })
})

test('non-React consumers use the workspace info cache and follow its updates', async () => {
  const { ownerApiBase, isRemoteWorkspace } = await import('./remote')
  const { workspaceKeys } = await import('@/client/api/workspace-keys')
  const client = new QueryClient()
  try {
    seedWorkspaceInfo('visitor', { user_id: 'alice', workspace_id: 'board' }, client)
    expect(ownerApiBase('visitor', client)).toBe('/api/workspaces/alice:board')
    expect(isRemoteWorkspace('visitor', client)).toBe(true)
    expect(
      client
        .getQueryCache()
        .getAll()
        .map(query => query.queryKey)
    ).toEqual([workspaceKeys.layout('visitor')])
    seedWorkspaceInfo('visitor', { user_id: 'bob', workspace_id: 'board' }, client)
    expect(ownerApiBase('visitor', client)).toBe('/api/workspaces/bob:board')
    seedWorkspaceInfo('visitor', undefined, client)
    expect(ownerApiBase('visitor', client)).toBe('/api/workspaces/visitor')
    expect(isRemoteWorkspace('visitor', client)).toBe(false)
    client.removeQueries({ queryKey: workspaceKeys.layout('visitor') })
    expect(() => ownerApiBase('visitor', client)).toThrow('Workspace identity is not loaded')
  } finally {
    client.clear()
  }
})
