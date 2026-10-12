import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Link, Route, Router } from 'wouter'

import { workspaceKeys } from '@/client/api/workspace-keys'
import { selectedSessionKey } from '@/client/features/chat/sessions/useSelectedSession'
import { CollabContext } from '@/client/features/collab/provider'
import { NO_ENGINE } from '@/client/features/collab/client'
import { createFakeEngine } from '@/client/features/collab/testing/fake-engine'
import * as workspaceEvents from '@/client/runtime/useWorkspaceEvents'
import { resolveUrl } from '@/lib/navigation'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import type {
  SessionInfo,
  WorkspaceSessionSelection,
  WorkspaceTabId,
  WorkspaceTabsState
} from '@/lib/types'
import { Workspace } from './WorkspaceContext'
import { WorkspaceLayoutContext } from './WorkspaceLayoutContext'
import { useWorkspaceNavigation } from './useWorkspaceNavigation'

let cleanup: () => Promise<void> = async () => {}
afterEach(() => cleanup())

function mountNavigation(
  path: string,
  collab: boolean,
  tabs: WorkspaceTabsState = { open: ['overview', 'scratchpad'], active: 'scratchpad' }
) {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  const location = new URL(`http://localhost/prefix/workspace/abc/${path}`)
  Object.defineProperty(window, 'location', { configurable: true, value: location })
  const storage = new Map<string, string>()
  const entries: { kind: 'push' | 'replace'; href: string }[] = []
  const pages = [location.href]
  const globals = {
    window,
    document,
    location,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLAnchorElement: window.HTMLAnchorElement,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    history: {
      pushState: (_state: unknown, _title: string, href: string) => {
        entries.push({ kind: 'push', href })
        pages.push(new URL(href, location).href)
        move(href)
      },
      replaceState: (_state: unknown, _title: string, href: string) => {
        entries.push({ kind: 'replace', href })
        pages[pages.length - 1] = new URL(href, location).href
        move(href)
      },
      back: () => {
        if (pages.length <= 1) return
        pages.pop()
        move(pages.at(-1)!)
      }
    },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    },
    IS_REACT_ACT_ENVIRONMENT: true
  }
  function move(href: string) {
    location.href = new URL(href, location).href
    window.dispatchEvent(new window.Event('popstate'))
  }
  const descriptors = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  notifyManager.setNotifyFunction(callback => {
    act(callback)
  })

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let selection: WorkspaceSessionSelection = { selected: { overview: 'previous' }, pinned: 'other' }
  const responses: { sessions: SessionInfo[] | Promise<SessionInfo[]> } = {
    sessions: [{ sessionId: 'source', summary: 'Source', lastModified: 1, tabId: 'scratchpad' }]
  }
  queryClient.setQueryData(workspaceKeys.sessions('abc'), responses.sessions)
  queryClient.setQueryData(selectedSessionKey('abc'), selection)
  if (collab)
    queryClient.setQueryData(selectedSessionKey('abc', 'browser-tab'), {
      selected: {},
      pinned: null
    })
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/sessions')) return Response.json(await responses.sessions)
        if (url.endsWith('/selected-session') && !init?.method) return Response.json(selection)
        const body = JSON.parse(String(init?.body)) as { sessionId: string; tabId: string }
        if (url.endsWith('/pinned-session')) {
          selection = { ...selection, pinned: null }
          return Response.json({ pinnedSessionId: null })
        }
        if (url.endsWith('/selected-session')) {
          selection = {
            ...selection,
            selected: { ...selection.selected, [body.tabId]: body.sessionId }
          }
          return Response.json({ sessionId: body.sessionId })
        }
        throw new Error(`Unexpected request: ${url}`)
      },
      { preconnect: fetch.preconnect }
    )
  )
  let navigate: (href: string) => void | Promise<void> = () => {
    throw new Error('Navigation controller was not registered')
  }
  const navigationSpy = spyOn(workspaceEvents, 'useNavigationClient').mockImplementation(
    (_workspaceId, callback) => {
      navigate = callback
    }
  )
  const eventsSpy = spyOn(workspaceEvents, 'useWorkspaceEvent').mockImplementation(() => {})

  function Probe() {
    const [revealed, setRevealed] = useState(false)
    const { activeTab, onNavigationClick, navigateToTab } = useWorkspaceNavigation({
      views: [{ id: 'orders', status: 'compiled', title: 'Orders' }],
      onOpenChat: () => setRevealed(true)
    })
    return (
      <div onClick={onNavigationClick}>
        <a
          data-link="source"
          href={`http://localhost${resolveUrl('moi:/chats/source', { workspaceId: 'abc', base: '/prefix' })}`}
        >
          Started from another chat
        </a>
        <a
          data-link="native"
          href={`http://localhost${resolveUrl('moi:/chats/source', { workspaceId: 'abc', base: '/prefix' })}`}
        >
          Chat link
        </a>
        <Link data-link="chat" href="/workspace/abc/chat">
          Open chat
        </Link>
        <a data-link="native-chat" href="http://localhost/prefix/workspace/abc/chat">
          Open current chat
        </a>
        <button data-tab="scratchpad" onClick={() => navigateToTab('scratchpad')}>
          Scratchpad
        </button>
        <button data-tab="orders" onClick={() => navigateToTab('views/orders')}>
          Orders
        </button>
        <output id="active-tab">{activeTab}</output>
        <output id="revealed">{revealed ? 'yes' : 'no'}</output>
      </div>
    )
  }
  function Layout() {
    const [layout, setLayout] = useState({ ...createDefaultWorkspaceLayout(), tabs })
    return (
      <WorkspaceLayoutContext
        value={{
          layout,
          setLayout: patch => setLayout(current => ({ ...current, ...patch })),
          name: null,
          cwd: null,
          provider: null,
          workspaceId: 'abc',
          isLoading: false
        }}
      >
        <Probe />
      </WorkspaceLayoutContext>
    )
  }
  const root = createRoot(document.getElementById('root')!)
  cleanup = async () => {
    await act(async () => {
      root.unmount()
      queryClient.clear()
      await Bun.sleep(0)
    })
    notifyManager.setNotifyFunction(callback => callback())
    fetchSpy.mockRestore()
    navigationSpy.mockRestore()
    eventsSpy.mockRestore()
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
  const render = () =>
    act(async () => {
      root.render(
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
              <Router base="/prefix">
                <Route path="/workspace/:id/*?">
                  <Layout />
                </Route>
              </Router>
            </QueryClientProvider>
          </CollabContext>
        </Workspace>
      )
    })
  const waitForReveal = async () => {
    for (let i = 0; i < 50 && document.getElementById('revealed')?.textContent !== 'yes'; i++)
      await act(async () => {
        await Bun.sleep(10)
      })
    expect(document.getElementById('revealed')?.textContent).toBe('yes')
  }
  const waitForNavigation = async (tab: WorkspaceTabId = 'scratchpad') => {
    await waitForReveal()
    expect(location.pathname).toBe(`/prefix/workspace/abc/${tab}`)
    expect(document.getElementById('active-tab')?.textContent).toBe(tab)
    expect(document.getElementById('revealed')?.textContent).toBe('yes')
    expect(
      queryClient.getQueryData<WorkspaceSessionSelection>(selectedSessionKey('abc'))?.pinned
    ).toBeNull()
    expect(
      queryClient.getQueryData<WorkspaceSessionSelection>(
        selectedSessionKey('abc', collab ? 'browser-tab' : 'shared')
      )?.selected[tab]
    ).toBe('source')
  }
  return {
    render,
    document,
    window,
    waitForNavigation,
    waitForReveal,
    queryClient,
    fetchSpy,
    responses,
    storage,
    navigate: (href: string) => Promise.resolve(navigate(href)),
    history: entries
  }
}

for (const collab of [false, true]) {
  describe(`mounted chat links with Collab ${collab ? 'enabled' : 'disabled'}`, () => {
    test.each(['overview', 'scratchpad?after=1'])(
      'a route change to %s cancels a pending chat lookup',
      async path => {
        const fixture = mountNavigation('scratchpad?before=1', collab)
        await fixture.render()
        const lookup = Promise.withResolvers<SessionInfo[]>()
        fixture.responses.sessions = lookup.promise
        const opening = fixture.navigate('moi:/chats/new')
        await act(async () => {
          fixture.window.history.pushState(null, '', `/prefix/workspace/abc/${path}`)
        })
        lookup.resolve([{ sessionId: 'new', summary: 'New', lastModified: 1 }])
        await act(async () => {
          await expect(opening).rejects.toMatchObject({ name: 'AbortError' })
        })
        expect(fixture.window.location.pathname + fixture.window.location.search).toBe(
          `/prefix/workspace/abc/${path}`
        )
        expect(fixture.document.getElementById('revealed')?.textContent).toBe('no')
        expect(fixture.fetchSpy.mock.calls.filter(([, init]) => init?.method === 'PUT')).toEqual([])
      }
    )
    test.each(['chat', 'chats/source'])(
      'navigation immediately followed by %s keeps the new page and parameters',
      async path => {
        const fixture = mountNavigation('scratchpad', collab)
        await fixture.render()
        await act(async () => {
          const switching = fixture.navigate('moi:/views/orders?order=o-3')
          const opening = fixture.navigate(`moi:/${path}`)
          await switching
          await opening
        })
        await fixture.waitForReveal()
        expect(fixture.window.location.pathname).toBe('/prefix/workspace/abc/views/orders')
        expect(new URLSearchParams(fixture.window.location.search).get('order')).toBe('o-3')
        if (path.startsWith('chats/')) await fixture.waitForNavigation('views/orders')
      }
    )
    test.each(['chats', 'chats/%', 'chats/a/b'])(
      'invalid chat route %s restores the saved tab without changing selection or pin',
      async path => {
        const fixture = mountNavigation(path, collab)
        if (collab)
          fixture.queryClient.setQueryData(selectedSessionKey('abc', 'browser-tab'), {
            selected: {},
            pinned: null
          })
        await fixture.render()
        expect(fixture.window.location.pathname).toBe('/prefix/workspace/abc/scratchpad')
        expect(fixture.document.getElementById('revealed')?.textContent).toBe('no')
        expect(
          fixture.queryClient.getQueryData<WorkspaceSessionSelection>(selectedSessionKey('abc'))
        ).toEqual({
          selected: { overview: 'previous' },
          pinned: 'other'
        })
        expect(fixture.fetchSpy.mock.calls.filter(([, init]) => init?.method === 'PUT')).toEqual([])
      }
    )
    test('tab navigation restores params and avoids a duplicate history entry', async () => {
      const fixture = mountNavigation('views/orders?order=o-1&literal=%252F', collab)
      await fixture.render()
      const clickTab = (tab: string) =>
        act(async () => {
          const click = new fixture.window.Event('click', { bubbles: true, cancelable: true })
          Object.assign(click, { button: 0 })
          fixture.document.querySelector(`button[data-tab="${tab}"]`)!.dispatchEvent(click)
        })
      await clickTab('scratchpad')
      expect(fixture.window.location.pathname).toBe('/prefix/workspace/abc/scratchpad')
      await clickTab('orders')
      expect(fixture.window.location.pathname).toBe('/prefix/workspace/abc/views/orders')
      const params = new URLSearchParams(fixture.window.location.search)
      expect(params.get('order')).toBe('o-1')
      expect(params.get('literal')).toBe('%2F')
      await clickTab('orders')
      expect(fixture.history.filter(entry => entry.kind === 'push')).toHaveLength(2)
      const savedTabs = fixture.storage.get('moi:collab:abc:tabs')
      if (collab) expect(JSON.parse(savedTabs!).active).toBe('views/orders')
      else expect(savedTabs).toBeUndefined()
    })

    test.each([null, 'other'])(
      'a direct current-chat URL restores the saved tab and preserves pin %s and selection',
      async pinned => {
        const fixture = mountNavigation('chat', collab)
        const selection = { selected: { overview: 'previous' }, pinned }
        const local = { selected: { overview: 'local' }, pinned: null }
        fixture.queryClient.setQueryData(selectedSessionKey('abc'), selection)
        if (collab)
          fixture.queryClient.setQueryData(selectedSessionKey('abc', 'browser-tab'), local)
        await fixture.render()
        await fixture.waitForReveal()
        expect(fixture.window.location.pathname).toBe('/prefix/workspace/abc/scratchpad')
        expect(fixture.document.getElementById('active-tab')?.textContent).toBe('scratchpad')
        expect(fixture.history).toEqual([
          { kind: 'replace', href: '/prefix/workspace/abc/scratchpad' }
        ])
        expect(
          fixture.queryClient.getQueryData<WorkspaceSessionSelection>(selectedSessionKey('abc'))
        ).toEqual(selection)
        if (collab)
          expect(
            fixture.queryClient.getQueryData<WorkspaceSessionSelection>(
              selectedSessionKey('abc', 'browser-tab')
            )
          ).toEqual(local)
        expect(fixture.fetchSpy.mock.calls.filter(([, init]) => init?.method === 'PUT')).toEqual([])
      }
    )

    test.each(['chat', 'native-chat'])(
      'clicking a %s link stays on the current tab and reveals the current chat',
      async kind => {
        const fixture = mountNavigation('scratchpad', collab)
        await fixture.render()
        const click = new fixture.window.Event('click', { bubbles: true, cancelable: true })
        Object.assign(click, { button: 0 })
        await act(async () => {
          fixture.document.querySelector(`a[data-link="${kind}"]`)!.dispatchEvent(click)
        })
        expect(click.defaultPrevented).toBe(true)
        await fixture.waitForReveal()
        expect(fixture.window.location.pathname).toBe('/prefix/workspace/abc/scratchpad')
        expect(fixture.history.filter(entry => entry.kind === 'push')).toHaveLength(
          kind === 'native-chat' ? 0 : 1
        )
        expect(
          fixture.queryClient.getQueryData<WorkspaceSessionSelection>(selectedSessionKey('abc'))
        ).toEqual({
          selected: { overview: 'previous' },
          pinned: 'other'
        })
        await act(async () => fixture.window.history.back())
        expect(fixture.window.location.pathname).toBe('/prefix/workspace/abc/scratchpad')
      }
    )

    test.each(['chats/source', 'chats/%73ource'])(
      'a direct chat URL %s selects and reveals its chat through the route effect',
      async path => {
        const fixture = mountNavigation(path, collab)
        await fixture.render()
        await fixture.waitForNavigation()
        // A direct load has no origin page, so the entry route is replaced in place.
        expect(fixture.history).toEqual([
          { kind: 'replace', href: '/prefix/workspace/abc/scratchpad' }
        ])
      }
    )

    test.each(['chat', 'chats/source'])(
      'a direct %s URL restores the last view regardless of the chat home tab',
      async path => {
        const fixture = mountNavigation(path, collab, {
          open: ['overview', 'scratchpad', 'views/orders'],
          active: 'views/orders'
        })
        await fixture.render()
        await fixture.waitForReveal()
        expect(fixture.window.location.pathname).toBe('/prefix/workspace/abc/views/orders')
        expect(fixture.document.getElementById('active-tab')?.textContent).toBe('views/orders')
        if (path.startsWith('chats/')) await fixture.waitForNavigation('views/orders')
      }
    )

    test.each(['chat', 'native-chat', 'source', 'native'])(
      'clicking a %s link preserves the current view and its parameters',
      async kind => {
        const fixture = mountNavigation('views/orders?order=o-2&literal=%252F', collab)
        await fixture.render()
        await act(async () => {
          const click = new fixture.window.Event('click', { bubbles: true, cancelable: true })
          Object.assign(click, { button: 0 })
          fixture.document.querySelector(`a[data-link="${kind}"]`)!.dispatchEvent(click)
        })
        await fixture.waitForReveal()
        expect(fixture.window.location.pathname).toBe('/prefix/workspace/abc/views/orders')
        const params = new URLSearchParams(fixture.window.location.search)
        expect(params.get('order')).toBe('o-2')
        expect(params.get('literal')).toBe('%2F')
        if (kind === 'source' || kind === 'native') await fixture.waitForNavigation('views/orders')
      }
    )

    test.each(['source', 'native'])(
      'clicking a %s chat link selects and reveals its chat',
      async kind => {
        const fixture = mountNavigation('overview', collab)
        await fixture.render()
        const click = new fixture.window.Event('click', { bubbles: true, cancelable: true })
        Object.assign(click, { button: 0 })
        await act(async () => {
          fixture.document.querySelector(`a[data-link="${kind}"]`)!.dispatchEvent(click)
        })
        expect(click.defaultPrevented).toBe(true)
        await fixture.waitForNavigation('overview')
        expect(fixture.history.filter(entry => entry.kind === 'push')).toHaveLength(0)
        await act(async () => fixture.window.history.back())
        expect(fixture.window.location.pathname).toBe('/prefix/workspace/abc/overview')
      }
    )
  })
}
