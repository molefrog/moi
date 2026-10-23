import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route, Router } from 'wouter'

import { workspaceKeys } from '@/client/api/workspace-keys'
import { Workspace } from './workspace-context'
import { CollabContext } from '@/client/features/collab/provider'
import { NO_ENGINE } from '@/client/features/collab/client'
import { createFakeEngine } from '@/client/features/collab/testing/fake-engine'
import {
  browserTabSelectionKey,
  useCurrentTabId
} from '@/client/features/chat/sessions/use-selected-session'
import type { BrowserTabSelection } from '@/client/features/chat/sessions/browser-tab-state'
import type {
  SessionSummary,
  ViewInfo,
  WorkspaceState,
  WorkspaceTabId,
  WorkspaceTabsState
} from '@/lib/types'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import * as workspaceEvents from '@/client/runtime/use-workspace-events'
import { WorkspaceLayoutContext } from './workspace-layout-context'
import { useWorkspaceNavigation } from './use-workspace-navigation'

type ReadNavigationOptions = {
  base?: string
  navigate?: (path: string, options?: { replace?: boolean }) => void
  queryClient?: QueryClient
  onOpenChat?: () => void
  collab?: boolean
  tabs?: WorkspaceTabsState
}

function readNavigation(
  path: string,
  search: string,
  views: ViewInfo[],
  {
    base = '',
    navigate,
    queryClient = new QueryClient(),
    onOpenChat = () => {},
    collab = false,
    tabs = createDefaultWorkspaceLayout().tabs
  }: ReadNavigationOptions = {}
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
                  layout: { ...createDefaultWorkspaceLayout(), tabs },
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

test('view params keep the first repeated value and ordinary object keys', () => {
  const result = readNavigation('views/events', 'x=1&x=2&__proto__=safe', [
    { id: 'events', status: 'compiled', title: 'Events' }
  ])
  expect(result.appletParams.x).toBe('1')
  expect(Object.hasOwn(result.appletParams, '__proto__')).toBe(true)
  expect(result.appletParams.__proto__).toBe('safe')
})

test('encoded IDs resolve under a deployment base without decoding nested escapes', () => {
  const views: ViewInfo[] = [{ id: 'events', status: 'compiled', title: 'events' }]
  expect(readNavigation('views/%65vents', '', views, { base: '/prefix' }).activeTab).toBe(
    'views/events'
  )
  expect(readNavigation('views/%2565vents', '', views, { base: '/prefix' }).isUnavailable).toBe(
    true
  )
})

test.each([
  ['views/%65vents', 'views/events'],
  ['views/%2565vents', 'overview']
])('current tab decodes the route %s once', (path, expected) => {
  function CurrentTab() {
    return <output>{useCurrentTabId()}</output>
  }
  const html = renderToStaticMarkup(
    <Router base="/prefix" ssrPath={`/prefix/workspace/abc/${path}`}>
      <Route path="/workspace/:id/*?">
        <CurrentTab />
      </Route>
    </Router>
  )
  expect(html).toBe(`<output>${expected}</output>`)
})

test('missing views keep their destination without becoming the default tab', () => {
  const result = readNavigation('views/missing', '?eventId=123', [])
  expect(result.activeTab).toBe('views/missing')
  expect(result.isUnavailable).toBe(true)
  expect(result.appletParams).toEqual({ eventId: '123' })
})

test('chat entry routes never render the unavailable page or become tabs', () => {
  expect(readNavigation('chat', '', []).isUnavailable).toBe(false)
  expect(readNavigation('chat', '', []).activeTab).toBe('overview')
  expect(readNavigation('chats/%61bc', '', []).isUnavailable).toBe(false)
  expect(readNavigation('chats/missing', '', []).activeTab).toBe('overview')
})

test('retired browser paths show recovery under a deployment base', () => {
  const views: ViewInfo[] = [{ id: 'events', status: 'compiled', title: 'events' }]
  const result = readNavigation('view:%65vents', 'eventId=123', views, { base: '/prefix' })
  expect(result.isUnavailable).toBe(true)
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
    const emptyState: WorkspaceState = { revision: 1, selected: {}, sessions: {}, pendingViews: {} }
    // Views still being built arrive with the workspace state.
    let freshState: WorkspaceState | Promise<WorkspaceState> = emptyState
    const queryClient = new QueryClient()
    queryClient.setQueryDefaults(workspaceKeys.views('abc'), {
      queryFn: () => views,
      retry: false
    })
    queryClient.setQueryData(workspaceKeys.state('abc'), emptyState)
    const stateRequests = spyOn(globalThis, 'fetch').mockImplementation(
      Object.assign(
        async (input: RequestInfo | URL) => {
          if (String(input) !== '/api/workspaces/abc/state')
            throw new Error(`Unexpected request: ${String(input)}`)
          return Response.json(await freshState)
        },
        { preconnect: fetch.preconnect }
      )
    )
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
      readNavigation('overview', '', views, {
        base,
        navigate: path => {
          routedPaths.push(path)
        },
        queryClient
      })
      await navigate('moi:/overview')
      expect(routedPaths).toEqual([])
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

      const refresh = Promise.withResolvers<WorkspaceState>()
      freshState = refresh.promise
      const opening = navigate('moi:/views/new')
      expect(routedPaths).toHaveLength(1)
      refresh.resolve({
        ...emptyState,
        revision: 2,
        pendingViews: { new: { status: 'draft', requirements: '' } }
      })
      await opening
      expect(routedPaths).toEqual([
        `${prefix}/workspace/abc/views/orders?order=o-1`,
        `${prefix}/workspace/abc/views/new`
      ])

      const laterRefresh = Promise.withResolvers<WorkspaceState>()
      freshState = laterRefresh.promise
      const cancelled = navigate('moi:/views/later')
      await navigate('moi:/scratchpad')
      laterRefresh.resolve({
        ...emptyState,
        revision: 3,
        pendingViews: { later: { status: 'draft', requirements: '' } }
      })
      await expect(Promise.resolve(cancelled)).rejects.toMatchObject({ name: 'AbortError' })
      expect(routedPaths.at(-1)).toBe(`${prefix}/workspace/abc/scratchpad`)
      expect(routedPaths).not.toContain(`${prefix}/workspace/abc/views/later`)
    } finally {
      registration.mockRestore()
      stateRequests.mockRestore()
      if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor)
      else Reflect.deleteProperty(globalThis, 'window')
    }
  }
)

type Write = { method: string; url: string; body: unknown }

function createChatNavigationFixture(collab: boolean) {
  const views: ViewInfo[] = [
    { id: 'orders', status: 'compiled', title: 'Orders' },
    { id: 'draft', status: 'draft', requirements: '' }
  ]
  const sessions: SessionSummary[] = [
    { sessionId: 'general', summary: 'General', lastModified: 1 },
    { sessionId: 'notes', summary: 'Notes', lastModified: 1 },
    { sessionId: 'orders', summary: 'Orders', lastModified: 1 },
    { sessionId: 'draft', summary: 'Draft', lastModified: 1 },
    { sessionId: 'gone', summary: 'Gone', lastModified: 1 }
  ]
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(workspaceKeys.sessions('abc'), sessions)
  const routed: { path: string; replace?: boolean }[] = []
  const revealed: boolean[] = []
  const writes: Write[] = []
  const initial: WorkspaceState = {
    revision: 1,
    selected: { overview: 'previous' },
    sessions: {
      notes: { tabId: 'scratchpad' },
      orders: { tabId: 'views/orders' },
      draft: { tabId: 'views/draft' },
      gone: { tabId: 'views/gone' }
    },
    pendingViews: { draft: { status: 'draft', requirements: '' } }
  }
  // The fake server's copy. Tests start from a state with `setState`, which
  // sets both this copy and the cache.
  let server = initial
  const setState = (patch: Partial<WorkspaceState>) => {
    server = { ...server, ...patch }
    queryClient.setQueryData(workspaceKeys.state('abc'), server)
  }
  queryClient.setQueryData(workspaceKeys.state('abc'), server)
  const responses: {
    sessions: Promise<SessionSummary[]>
    state?: Promise<WorkspaceState>
    pin?: Response
    save?: Promise<Response>
    onSave?: () => void
  } = { sessions: Promise.resolve(sessions) }
  let navigate: (href: string) => void | Promise<void> = () => {}
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        href: 'http://localhost/prefix/workspace/abc/scratchpad',
        pathname: '/prefix/workspace/abc/scratchpad',
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
        const method = init?.method ?? 'GET'
        if (url === '/api/workspaces/abc/sessions') return Response.json(await responses.sessions)
        if (url === '/api/workspaces/abc/state' && method === 'GET')
          return Response.json(await (responses.state ?? server))
        const write = url.match(/^\/api\/workspaces\/abc\/sessions\/([^/]+)\/(pin|selection)$/)
        if (!write) throw new Error(`Unexpected request: ${method} ${url}`)
        const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined
        writes.push({ method, url, body })
        const sessionId = decodeURIComponent(write[1]!)
        if (write[2] === 'pin') {
          if (responses.pin) return responses.pin
          const { pinnedSessionId: _pinned, ...rest } = server
          server = {
            ...rest,
            revision: server.revision + 1,
            ...(method === 'PUT' ? { pinnedSessionId: sessionId } : {})
          }
          return Response.json(server)
        }
        if (responses.save) {
          responses.onSave?.()
          return responses.save
        }
        const { tabId } = body as { tabId: WorkspaceTabId }
        server = {
          ...server,
          revision: server.revision + 1,
          selected: { ...server.selected, [tabId]: sessionId }
        }
        return Response.json(server)
      },
      { preconnect: fetch.preconnect }
    )
  )
  const registration = spyOn(workspaceEvents, 'useNavigationClient').mockImplementation(
    (_id, callback) => {
      navigate = callback
    }
  )
  readNavigation('scratchpad', '', views, {
    base: '/prefix',
    navigate: (path, options) => routed.push({ path, ...options }),
    queryClient,
    onOpenChat: () => revealed.push(true),
    collab,
    tabs: { open: ['overview', 'scratchpad'], active: 'scratchpad' }
  })
  return {
    queryClient,
    sessions,
    initial,
    setState,
    responses,
    routed,
    revealed,
    writes,
    storage,
    cachedState: () => queryClient.getQueryData<WorkspaceState>(workspaceKeys.state('abc')),
    // The chat this browser tab's selection shows on a workspace tab.
    selectedIn: (tab: WorkspaceTabId) =>
      collab
        ? queryClient.getQueryData<BrowserTabSelection>(browserTabSelectionKey('abc'))?.selected[
            tab
          ]
        : queryClient.getQueryData<WorkspaceState>(workspaceKeys.state('abc'))?.selected[tab],
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

const selectionUrl = (id: string) => `/api/workspaces/abc/sessions/${id}/selection`
const pinUrl = (id: string) => `/api/workspaces/abc/sessions/${id}/pin`

for (const collab of [false, true]) {
  describe(`chat links with Collab ${collab ? 'enabled' : 'disabled'}`, () => {
    let fixture: ReturnType<typeof createChatNavigationFixture>
    beforeEach(() => {
      fixture = createChatNavigationFixture(collab)
    })
    afterEach(() => fixture.cleanup())

    test.each([
      { selected: { overview: 'previous' } },
      { selected: { overview: 'previous' }, pinnedSessionId: 'other' },
      { selected: {} }
    ] satisfies Partial<WorkspaceState>[])(
      'opens the current chat without changing selection %j',
      async patch => {
        const { queryClient, setState, cachedState, navigate, routed, revealed, writes, storage } =
          fixture
        setState(patch)
        const before = cachedState()
        const local: BrowserTabSelection = { selected: { overview: 'local' } }
        if (collab) queryClient.setQueryData(browserTabSelectionKey('abc'), local)
        await navigate('moi:/chat')
        expect(routed).toEqual([])
        expect(revealed).toEqual([true])
        expect(cachedState()).toEqual(before)
        if (collab)
          expect(
            queryClient.getQueryData<BrowserTabSelection>(browserTabSelectionKey('abc'))
          ).toEqual(local)
        expect(writes).toEqual([])
        expect(storage.size).toBe(0)
      }
    )

    test.each([
      ['a general chat', 'general', undefined],
      ['a Scratchpad chat', 'notes', undefined],
      ['a view chat and unpins another chat', 'orders', 'other'],
      ['a pending view chat and preserves its pin', 'draft', 'draft'],
      ['a chat whose original view was removed', 'gone', undefined]
    ] as const)('opens %s on the current tab', async (_name, id, pinned) => {
      const { setState, cachedState, selectedIn, navigate, routed, revealed, writes, storage } =
        fixture
      setState({ pinnedSessionId: pinned })
      await navigate(`moi:/chats/${id}`)
      expect(routed).toEqual([])
      expect(revealed).toEqual([true])
      expect(cachedState()?.pinnedSessionId).toBe(pinned === id ? id : undefined)
      if (pinned === id) {
        expect(writes).toEqual([])
        return
      }
      expect(selectedIn('scratchpad')).toBe(id)
      expect(writes).toEqual([
        ...(pinned ? [{ method: 'DELETE', url: pinUrl(pinned), body: undefined }] : []),
        ...(collab
          ? []
          : [
              { method: 'PUT', url: selectionUrl(id), body: { tabId: 'scratchpad', ifMatch: null } }
            ])
      ])
      if (collab)
        expect(JSON.parse(storage.get('moi:collab:abc:session')!).selected.scratchpad).toBe(id)
    })

    test('waits for pin state on a direct load before selecting', async () => {
      const { queryClient, responses, initial, navigate, writes, routed, revealed } = fixture
      queryClient.removeQueries({ queryKey: workspaceKeys.state('abc'), exact: true })
      const loading = Promise.withResolvers<WorkspaceState>()
      responses.state = loading.promise
      const opening = navigate('moi:/chats/general')
      expect(writes).toEqual([])
      expect(routed).toEqual([])
      loading.resolve({ ...initial, pinnedSessionId: 'other' })
      await opening
      expect(writes.map(write => write.url)).toEqual([
        pinUrl('other'),
        ...(collab ? [] : [selectionUrl('general')])
      ])
      expect(revealed).toEqual([true])
    })

    test('opens a chat the agent lists before Moi has a record of it', async () => {
      const { queryClient, sessions, selectedIn, navigate, routed, revealed } = fixture
      queryClient.setQueryData(workspaceKeys.sessions('abc'), [
        ...sessions,
        { sessionId: 'outside', summary: 'Started in a terminal', lastModified: 1 }
      ])
      await navigate('moi:/chats/outside')
      expect(routed).toEqual([])
      expect(revealed).toEqual([true])
      expect(selectedIn('scratchpad')).toBe('outside')
    })

    test('failed unpinning stops before selection or redirect', async () => {
      const { queryClient, setState, cachedState, responses, navigate, writes, routed, revealed } =
        fixture
      setState({ pinnedSessionId: 'other' })
      responses.pin = Response.json({ error: 'Unpin failed' }, { status: 500 })
      await expect(navigate('moi:/chats/general')).rejects.toThrow()
      expect(routed).toEqual([])
      expect(revealed).toEqual([])
      expect(writes.map(write => write.url)).toEqual([pinUrl('other')])
      // The failure refetches the server's copy, which still has the pin.
      await queryClient.refetchQueries({ queryKey: workspaceKeys.state('abc'), exact: true })
      expect(cachedState()?.pinnedSessionId).toBe('other')
    })

    if (!collab) {
      test('waits for selection persistence before redirecting or acknowledging', async () => {
        const { initial, responses, navigate, routed, revealed } = fixture
        const saving = Promise.withResolvers<Response>()
        const requested = Promise.withResolvers<void>()
        responses.save = saving.promise
        responses.onSave = () => requested.resolve()
        const opening = navigate('moi:/chats/general')
        await requested.promise
        expect(routed).toEqual([])
        expect(revealed).toEqual([])
        saving.resolve(
          Response.json({
            ...initial,
            revision: 2,
            selected: { ...initial.selected, scratchpad: 'general' }
          })
        )
        await opening
        expect(routed).toEqual([])
        expect(revealed).toEqual([true])
      })

      test('a refused conditional selection save does not open the chat', async () => {
        const { initial, responses, navigate, routed, revealed } = fixture
        responses.save = Promise.resolve(
          Response.json({
            ...initial,
            revision: 2,
            selected: { ...initial.selected, scratchpad: 'someone-else' }
          })
        )
        await expect(navigate('moi:/chats/general')).rejects.toThrow('Couldn’t save selected chat')
        expect(routed).toEqual([])
        expect(revealed).toEqual([])
      })
    }

    test('a missing chat keeps the current tab, selection, and pin', async () => {
      const { setState, cachedState, navigate, writes, routed, revealed } = fixture
      setState({ pinnedSessionId: 'pin' })
      const original = cachedState()
      await navigate('moi:/chats/missing')
      expect(routed).toEqual([])
      expect(cachedState()).toEqual(original)
      expect(writes).toEqual([])
      expect(revealed).toEqual([])
    })

    test.each(['moi:/overview', 'moi:/chat'])(
      'navigation to %s cancels a pending lookup without changing selection or pin',
      async href => {
        const { setState, cachedState, responses, sessions, navigate, writes, routed, revealed } =
          fixture
        setState({ pinnedSessionId: 'pin' })
        const original = cachedState()
        const refresh = Promise.withResolvers<SessionSummary[]>()
        responses.sessions = refresh.promise
        const opening = navigate('moi:/chats/new')
        await navigate(href)
        refresh.resolve([...sessions, { sessionId: 'new', summary: 'New', lastModified: 2 }])
        await expect(opening).rejects.toMatchObject({ name: 'AbortError' })
        expect(cachedState()).toEqual(original)
        expect(writes).toEqual([])
        expect(revealed).toEqual(href === 'moi:/chat' ? [true] : [])
        expect(routed).toEqual(
          href === 'moi:/chat' ? [] : [{ path: '/prefix/workspace/abc/overview', replace: false }]
        )
      }
    )

    test('refreshes a missing cached chat before falling back', async () => {
      const { responses, sessions, navigate, revealed } = fixture
      responses.sessions = Promise.resolve([
        ...sessions,
        { sessionId: 'new', summary: 'New', lastModified: 2 }
      ])
      await navigate('moi:/chats/new')
      expect(revealed).toEqual([true])
    })
  })
}
