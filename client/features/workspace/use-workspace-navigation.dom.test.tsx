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
import { addressPath } from '@/lib/navigation'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import type { WorkspaceSessionSelection } from '@/lib/types'
import { Workspace } from './WorkspaceContext'
import { WorkspaceLayoutContext } from './WorkspaceLayoutContext'
import { useWorkspaceNavigation } from './useWorkspaceNavigation'

let cleanup: () => Promise<void> = async () => {}
afterEach(() => cleanup())

function mountNavigation(path: string, collab: boolean) {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  const location = new URL(`http://localhost/prefix/workspace/abc/${path}`)
  Object.defineProperty(window, 'location', { configurable: true, value: location })
  const storage = new Map<string, string>()
  const entries: { kind: 'push' | 'replace'; href: string }[] = []
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
        move(href)
      },
      replaceState: (_state: unknown, _title: string, href: string) => {
        entries.push({ kind: 'replace', href })
        move(href)
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
  queryClient.setQueryData(workspaceKeys.sessions('abc'), [
    { sessionId: 'source', summary: 'Source', lastModified: 1, tabId: 'scratchpad' }
  ])
  queryClient.setQueryData(selectedSessionKey('abc'), selection)
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
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
  const navigationSpy = spyOn(workspaceEvents, 'useNavigationClient').mockImplementation(() => {})
  const eventsSpy = spyOn(workspaceEvents, 'useWorkspaceEvent').mockImplementation(() => {})

  function Probe() {
    const [revealed, setRevealed] = useState(false)
    const { activeTab, onNavigationClick } = useWorkspaceNavigation({
      views: [],
      onOpenChat: () => setRevealed(true)
    })
    return (
      <div onClick={onNavigationClick}>
        <Link data-link="source" href={addressPath('abc', { sessionId: 'source', search: '' })}>
          Started from another chat
        </Link>
        <a
          data-link="native"
          href={`http://localhost${addressPath('abc', { sessionId: 'source', search: '' }, '/prefix')}`}
        >
          Chat link
        </a>
        <output id="active-tab">{activeTab}</output>
        <output id="revealed">{revealed ? 'yes' : 'no'}</output>
      </div>
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
    })
  const waitForNavigation = async () => {
    for (let i = 0; i < 50 && document.getElementById('revealed')?.textContent !== 'yes'; i++)
      await act(async () => {
        await Bun.sleep(10)
      })
    expect(location.pathname).toBe('/prefix/workspace/abc/scratchpad')
    expect(document.getElementById('active-tab')?.textContent).toBe('scratchpad')
    expect(document.getElementById('revealed')?.textContent).toBe('yes')
    expect(
      queryClient.getQueryData<WorkspaceSessionSelection>(selectedSessionKey('abc'))?.pinned
    ).toBeNull()
    expect(
      queryClient.getQueryData<WorkspaceSessionSelection>(
        selectedSessionKey('abc', collab ? 'browser-tab' : 'shared')
      )?.selected.scratchpad
    ).toBe('source')
  }
  return { render, document, window, waitForNavigation, history: entries }
}

for (const collab of [false, true]) {
  describe(`mounted chat links with Collab ${collab ? 'enabled' : 'disabled'}`, () => {
    test('a direct chat URL selects and reveals its chat through the route effect', async () => {
      const fixture = mountNavigation('chats/source', collab)
      await fixture.render()
      await fixture.waitForNavigation()
      // A direct load has no origin page, so the entry route is replaced in place.
      expect(fixture.history).toEqual([
        { kind: 'replace', href: '/prefix/workspace/abc/scratchpad' }
      ])
    })

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
        await fixture.waitForNavigation()
        // One net history entry: the pushed chat route is replaced by its home
        // tab, so Back returns to the page the link was clicked on.
        expect(fixture.history).toEqual([
          { kind: 'push', href: '/prefix/workspace/abc/chats/source' },
          { kind: 'replace', href: '/prefix/workspace/abc/scratchpad' }
        ])
      }
    )
  })
}
