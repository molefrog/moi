import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route, Router } from 'wouter'

import { workspaceKeys } from '@/client/api/workspace-keys'
import { Workspace } from './WorkspaceContext'
import { CollabContext } from '@/client/features/collab/provider'
import { NO_ENGINE } from '@/client/features/collab/client'
import { createFakeEngine } from '@/client/features/collab/testing/fake-engine'
import { selectedSessionKey } from '@/client/features/chat/sessions/useSelectedSession'
import type { SessionInfo, ViewInfo, WorkspaceSessionSelection, WorkspaceTabId } from '@/lib/types'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import * as workspaceEvents from '@/client/runtime/useWorkspaceEvents'
import { WorkspaceLayoutContext } from './WorkspaceLayoutContext'
import { useWorkspaceNavigation } from './useWorkspaceNavigation'

function readNavigation(
  path: string,
  search: string,
  views: ViewInfo[],
  base = '',
  navigate?: (path: string) => void,
  queryClient = new QueryClient(),
  onOpenChat: (tab: WorkspaceTabId) => void = () => {},
  collab = false
) {
  const queryKey = workspaceKeys.views('abc')
  if (!queryClient.getQueryDefaults(queryKey).queryFn)
    queryClient.setQueryDefaults(queryKey, { queryFn: async () => views, retry: false })
  queryClient.setQueryData(queryKey, views)
  const prefix = base === '/' ? '' : base
  function Probe() {
    const { activeTab, appletParams, isUnavailable } = useWorkspaceNavigation({
      views,
      onOpenChat
    })
    return (
      <script type="application/json">
        {JSON.stringify({ activeTab, appletParams, isUnavailable })}
      </script>
    )
  }
  const html = renderToStaticMarkup(
    <Workspace id="abc">
      <CollabContext
        value={
          collab
            ? createFakeEngine({
                self: { id: 'self', name: 'Self', color: 'blue' },
                page: 'overview'
              })
            : NO_ENGINE
        }
      >
        <QueryClientProvider client={queryClient}>
          <Router
            base={base}
            ssrPath={`${prefix}/workspace/abc/${path}`}
            ssrSearch={search}
            hook={navigate ? () => [`${prefix}/workspace/abc/${path}`, navigate] : undefined}
          >
            <Route path="/workspace/:id/*?">
              <WorkspaceLayoutContext
                value={{
                  layout: createDefaultWorkspaceLayout(),
                  setLayout: () => {},
                  name: null,
                  cwd: null,
                  provider: null,
                  workspaceId: 'abc',
                  isLoading: false
                }}
              >
                <Probe />
              </WorkspaceLayoutContext>
            </Route>
          </Router>
        </QueryClientProvider>
      </CollabContext>
    </Workspace>
  )
  if (!html) throw new Error('The workspace route did not match')
  return JSON.parse(html.slice(html.indexOf('>') + 1, html.lastIndexOf('<'))) as Pick<
    ReturnType<typeof useWorkspaceNavigation>,
    'activeTab' | 'appletParams' | 'isUnavailable'
  >
}

test('view params decode exactly once through the real router', () => {
  const params = { literal: '%20 %26 %2F', json: '{"value":"100%"}', plus: '+' }
  const result = readNavigation('views/events', new URLSearchParams(params).toString(), [
    { id: 'events', status: 'compiled', title: 'events' }
  ])
  expect(result.appletParams).toEqual(params)
})

test('encoded IDs resolve under a deployment base without decoding nested escapes', () => {
  const views: ViewInfo[] = [{ id: 'events', status: 'compiled', title: 'events' }]
  expect(readNavigation('views/%65vents', '', views, '/prefix').activeTab).toBe('views/events')
  expect(readNavigation('views/%2565vents', '', views, '/prefix').isUnavailable).toBe(true)
})

test('missing views keep their destination without becoming the default tab', () => {
  const result = readNavigation('views/missing', '?eventId=123', [])
  expect(result.activeTab).toBe('views/missing')
  expect(result.isUnavailable).toBe(true)
  expect(result.appletParams).toEqual({ eventId: '123' })
})

test('chat entry routes never render the unavailable page or become tabs', () => {
  expect(readNavigation('chats/%61bc', '', []).isUnavailable).toBe(false)
  expect(readNavigation('chats/missing', '', []).activeTab).toBe('overview')
})

test('legacy browser paths select the same view under a deployment base', () => {
  const views: ViewInfo[] = [{ id: 'events', status: 'compiled', title: 'events' }]
  const result = readNavigation('view:%65vents', 'eventId=123', views, '/prefix')
  expect(result.activeTab).toBe('views/events')
  expect(result.isUnavailable).toBe(false)
  expect(result.appletParams).toEqual({ eventId: '123' })
  expect(readNavigation('view:%2565vents', '', views).isUnavailable).toBe(true)
})

test.each(['', '/', '/prefix'])(
  'the navigation controller refreshes new views and routes pages and files with base "%s"',
  async base => {
    const prefix = base === '/' ? '' : base
    const nativePaths: string[] = []
    const routedPaths: string[] = []
    const views: ViewInfo[] = [{ id: 'orders', status: 'compiled', title: 'Orders' }]
    let freshViews: ViewInfo[] | Promise<ViewInfo[]> = views
    const queryClient = new QueryClient()
    queryClient.setQueryDefaults(workspaceKeys.views('abc'), {
      queryFn: () => freshViews,
      retry: false
    })
    let navigate: (path: string) => void | Promise<void> = () => {
      throw new Error('Navigation controller was not registered')
    }
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          pathname: `${prefix}/workspace/abc/overview`,
          search: '',
          hash: '',
          assign: (path: string) => nativePaths.push(path)
        }
      }
    })
    const registration = spyOn(workspaceEvents, 'useNavigationClient').mockImplementation(
      (_workspaceId, callback) => {
        navigate = callback
      }
    )
    try {
      readNavigation(
        'overview',
        '',
        views,
        base,
        path => {
          routedPaths.push(path)
        },
        queryClient
      )
      await navigate('moi:/views/orders?order=o-1')
      await navigate('moi:/files/clips/a%20b.mp4?version=2#t=5')
      await navigate('https://example.com/')
      expect(routedPaths).toEqual([`${prefix}/workspace/abc/views/orders?order=o-1`])
      expect(nativePaths).toEqual([
        '/api/workspaces/abc/files/clips/a%20b.mp4?version=2#t=5',
        'https://example.com/'
      ])
      await expect(Promise.resolve().then(() => navigate('moi:/views/missing'))).rejects.toThrow(
        'unavailable'
      )
      await expect(
        Promise.resolve().then(() => navigate('moi:/files/../photo.png'))
      ).rejects.toThrow()
      await expect(Promise.resolve().then(() => navigate('javascript:alert(1)'))).rejects.toThrow()
      expect(routedPaths).toHaveLength(1)
      expect(nativePaths).toHaveLength(2)

      const refresh = Promise.withResolvers<ViewInfo[]>()
      freshViews = refresh.promise
      const opening = navigate('moi:/views/new')
      expect(routedPaths).toHaveLength(1)
      refresh.resolve([...views, { id: 'new', status: 'draft', requirements: '' }])
      await opening
      expect(routedPaths).toEqual([
        `${prefix}/workspace/abc/views/orders?order=o-1`,
        `${prefix}/workspace/abc/views/new`
      ])
    } finally {
      registration.mockRestore()
      if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor)
      else Reflect.deleteProperty(globalThis, 'window')
    }
  }
)

function createChatNavigationFixture(collab: boolean) {
  const views: ViewInfo[] = [
    { id: 'orders', status: 'compiled', title: 'Orders' },
    { id: 'draft', status: 'draft', requirements: '' }
  ]
  const sessions: SessionInfo[] = [
    { sessionId: 'general', summary: 'General', lastModified: 1 },
    { sessionId: 'notes', summary: 'Notes', lastModified: 1, tabId: 'scratchpad' },
    { sessionId: 'orders', summary: 'Orders', lastModified: 1, tabId: 'views/orders' },
    { sessionId: 'draft', summary: 'Draft', lastModified: 1, tabId: 'views/draft' },
    { sessionId: 'gone', summary: 'Gone', lastModified: 1, tabId: 'views/gone' }
  ]
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(workspaceKeys.sessions('abc'), sessions)
  const routed: { path: string; replace?: boolean }[] = []
  const revealed: WorkspaceTabId[] = []
  const writes: { url: string; body: { sessionId: string | null; tabId?: WorkspaceTabId } }[] = []
  const selection: WorkspaceSessionSelection = {
    selected: { overview: 'previous' },
    pinned: null
  }
  queryClient.setQueryData(selectedSessionKey('abc'), selection)
  const responses: {
    sessions: Promise<SessionInfo[]>
    selection: Promise<WorkspaceSessionSelection>
    pin?: Response
    save?: Promise<Response>
    onSave?: () => void
  } = { sessions: Promise.resolve(sessions), selection: Promise.resolve(selection) }
  let navigate: (href: string) => void | Promise<void> = () => {}
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        href: 'http://localhost/prefix/workspace/abc/views/source',
        pathname: '/prefix/workspace/abc/views/source',
        search: '',
        hash: ''
      }
    }
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    }
  })
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/workspaces/abc/sessions') return Response.json(await responses.sessions)
        if (url.endsWith('/selected-session') && !init?.method)
          return Response.json(await responses.selection)
        if (init?.method !== 'PUT') throw new Error(`Unexpected request: ${url}`)
        const body = JSON.parse(String(init.body)) as {
          sessionId: string | null
          tabId?: WorkspaceTabId
        }
        writes.push({ url, body })
        if (url.endsWith('/pinned-session') && responses.pin) return responses.pin
        if (url.endsWith('/selected-session') && responses.save) {
          responses.onSave?.()
          return responses.save
        }
        return Response.json(
          url.endsWith('/pinned-session')
            ? { pinnedSessionId: body.sessionId }
            : { sessionId: body.sessionId }
        )
      },
      { preconnect: fetch.preconnect }
    )
  )
  const registration = spyOn(workspaceEvents, 'useNavigationClient').mockImplementation(
    (_id, callback) => {
      navigate = callback
    }
  )
  readNavigation(
    'overview',
    '',
    views,
    '/prefix',
    (path, options?: { replace?: boolean }) => routed.push({ path, ...options }),
    queryClient,
    tab => revealed.push(tab),
    collab
  )
  return {
    queryClient,
    sessions,
    selection,
    responses,
    routed,
    revealed,
    writes,
    storage,
    navigate: (href: string) => Promise.resolve(navigate(href)),
    cleanup() {
      fetchSpy.mockRestore()
      registration.mockRestore()
      queryClient.clear()
      if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow)
      else Reflect.deleteProperty(globalThis, 'window')
      if (savedStorage) Object.defineProperty(globalThis, 'sessionStorage', savedStorage)
      else Reflect.deleteProperty(globalThis, 'sessionStorage')
    }
  }
}

for (const collab of [false, true]) {
  describe(`chat links with Collab ${collab ? 'enabled' : 'disabled'}`, () => {
    let fixture: ReturnType<typeof createChatNavigationFixture>
    beforeEach(() => {
      fixture = createChatNavigationFixture(collab)
    })
    afterEach(() => fixture.cleanup())

    test.each([
      ['Overview', 'general', 'overview', null],
      ['Scratchpad', 'notes', 'scratchpad', null],
      ['a closed compiled view and unpins another chat', 'orders', 'views/orders', 'other'],
      ['a pending view and preserves the requested pin', 'draft', 'views/draft', 'draft']
    ] as const)('opens %s', async (_name, id, tab, pinned) => {
      const { queryClient, selection, navigate, routed, revealed, writes, storage } = fixture
      queryClient.setQueryData(selectedSessionKey('abc'), { ...selection, pinned })
      await navigate(`moi:/chats/${id}`)
      expect(routed).toEqual([{ path: `/prefix/workspace/abc/${tab}`, replace: true }])
      expect(revealed).toEqual([tab])
      expect(
        queryClient.getQueryData<WorkspaceSessionSelection>(selectedSessionKey('abc'))?.pinned
      ).toBe(pinned === id ? id : null)
      if (pinned === id) {
        expect(writes).toEqual([])
        return
      }
      const scope = collab ? 'browser-tab' : 'shared'
      expect(
        queryClient.getQueryData<WorkspaceSessionSelection>(selectedSessionKey('abc', scope))
          ?.selected[tab]
      ).toBe(id)
      expect(writes.map(write => write.url)).toEqual([
        ...(pinned ? ['/api/workspaces/abc/pinned-session'] : []),
        ...(collab ? [] : ['/api/workspaces/abc/selected-session'])
      ])
      if (collab) expect(JSON.parse(storage.get('moi:collab:abc:session')!).selected[tab]).toBe(id)
    })

    test('waits for pin state on a direct load before selecting', async () => {
      const { queryClient, responses, selection, navigate, writes, routed, revealed } = fixture
      queryClient.removeQueries({ queryKey: selectedSessionKey('abc'), exact: true })
      const loading = Promise.withResolvers<WorkspaceSessionSelection>()
      responses.selection = loading.promise
      const opening = navigate('moi:/chats/general')
      expect(writes).toEqual([])
      expect(routed).toEqual([])
      loading.resolve({ ...selection, pinned: 'other' })
      await opening
      expect(writes.map(write => write.url)).toEqual([
        '/api/workspaces/abc/pinned-session',
        ...(collab ? [] : ['/api/workspaces/abc/selected-session'])
      ])
      expect(revealed).toEqual(['overview'])
    })

    test('opens chats with persisted Agent tab attribution on Overview', async () => {
      const { queryClient, sessions, navigate, routed, revealed } = fixture
      queryClient.setQueryData(workspaceKeys.sessions('abc'), [
        ...sessions,
        { sessionId: 'legacy', summary: 'Legacy', lastModified: 1, tabId: 'agent' }
      ])
      await navigate('moi:/chats/legacy')
      expect(routed).toEqual([{ path: '/prefix/workspace/abc/overview', replace: true }])
      expect(revealed).toEqual(['overview'])
      expect(
        queryClient.getQueryData<WorkspaceSessionSelection>(
          selectedSessionKey('abc', collab ? 'browser-tab' : 'shared')
        )?.selected.overview
      ).toBe('legacy')
    })

    test('failed unpinning stops before selection or redirect', async () => {
      const { queryClient, responses, selection, navigate, writes, routed, revealed } = fixture
      queryClient.setQueryData(selectedSessionKey('abc'), { ...selection, pinned: 'other' })
      responses.pin = Response.json({ error: 'Unpin failed' }, { status: 500 })
      await expect(navigate('moi:/chats/general')).rejects.toThrow()
      expect(routed).toEqual([])
      expect(revealed).toEqual([])
      expect(writes.map(write => write.url)).toEqual(['/api/workspaces/abc/pinned-session'])
      expect(
        queryClient.getQueryData<WorkspaceSessionSelection>(selectedSessionKey('abc'))?.pinned
      ).toBe('other')
    })

    if (!collab) {
      test('waits for selection persistence before redirecting or acknowledging', async () => {
        const { responses, navigate, routed, revealed } = fixture
        const saving = Promise.withResolvers<Response>()
        const requested = Promise.withResolvers<void>()
        responses.save = saving.promise
        responses.onSave = () => requested.resolve()
        const opening = navigate('moi:/chats/general')
        await requested.promise
        expect(routed).toEqual([])
        expect(revealed).toEqual([])
        saving.resolve(Response.json({ sessionId: 'general' }))
        await opening
        expect(routed).toEqual([{ path: '/prefix/workspace/abc/overview', replace: true }])
        expect(revealed).toEqual(['overview'])
      })

      test('a refused conditional selection save does not open the chat', async () => {
        const { responses, navigate, routed, revealed } = fixture
        responses.save = Promise.resolve(Response.json({ sessionId: 'someone-else' }))
        await expect(navigate('moi:/chats/general')).rejects.toThrow('Couldn’t save selected chat')
        expect(routed).toEqual([])
        expect(revealed).toEqual([])
      })
    }

    test.each(['missing', 'gone'])(
      'falls back for %s without changing selection or pin',
      async id => {
        const { queryClient, selection, navigate, writes, routed, revealed } = fixture
        const original = { ...selection, pinned: 'pin' }
        queryClient.setQueryData(selectedSessionKey('abc'), original)
        await navigate(`moi:/chats/${id}`)
        expect(routed).toEqual([{ path: '/prefix/workspace/abc/overview', replace: true }])
        expect(
          queryClient.getQueryData<WorkspaceSessionSelection>(selectedSessionKey('abc'))
        ).toEqual(original)
        expect(writes).toEqual([])
        expect(revealed).toEqual([])
      }
    )

    test('navigation away cancels a pending lookup without changing selection or pin', async () => {
      const { queryClient, responses, sessions, selection, navigate, writes, routed, revealed } =
        fixture
      const original = { ...selection, pinned: 'pin' }
      queryClient.setQueryData(selectedSessionKey('abc'), original)
      const refresh = Promise.withResolvers<SessionInfo[]>()
      responses.sessions = refresh.promise
      const opening = navigate('moi:/chats/new')
      await navigate('moi:/scratchpad')
      refresh.resolve([...sessions, { sessionId: 'new', summary: 'New', lastModified: 2 }])
      await expect(opening).rejects.toMatchObject({ name: 'AbortError' })
      expect(
        queryClient.getQueryData<WorkspaceSessionSelection>(selectedSessionKey('abc'))
      ).toEqual(original)
      expect(writes).toEqual([])
      expect(revealed).toEqual([])
      expect(routed.at(-1)?.path).toBe('/prefix/workspace/abc/scratchpad')
    })

    test('refreshes a missing cached chat before falling back', async () => {
      const { responses, sessions, navigate, revealed } = fixture
      responses.sessions = Promise.resolve([
        ...sessions,
        { sessionId: 'new', summary: 'New', lastModified: 2 }
      ])
      await navigate('moi:/chats/new')
      expect(revealed).toEqual(['overview'])
    })
  })
}
