import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { act, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { workspaceKeys } from '@/client/api/workspace-keys'
import {
  usePinnedSession,
  useSelectedSession
} from '@/client/features/chat/sessions/use-selected-session'
import * as workspaceEvents from '@/client/runtime/use-workspace-events'
import type { WorkspaceEvent } from '@/client/runtime/use-workspace-events'
import type { WorkspaceState } from '@/lib/types'
import { Workspace } from './workspace-context'
import { useWorkspaceState, useWorkspaceStateSync, useWorkspaceStateWrite } from './workspace-state'

const WORKSPACE_ID = 'abc'

type Request = { method: string; url: string; body: unknown }

function workspaceState(patch: Partial<WorkspaceState> = {}): WorkspaceState {
  return { revision: 1, selected: {}, sessions: {}, pendingViews: {}, ...patch }
}

let cleanup: () => Promise<void> = async () => {}
afterEach(() => cleanup())

// Mounts `children` with a query client seeded with `initial`, a fake events
// socket, and a fake server that answers every request with `respond`.
function mount(initial: WorkspaceState, respond: (request: Request) => Promise<WorkspaceState>) {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  const globals = { window, document, IS_REACT_ACT_ENVIRONMENT: true }
  const descriptors = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  notifyManager.setNotifyFunction(callback => {
    act(callback)
  })

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(workspaceKeys.state(WORKSPACE_ID), initial)
  const requests: Request[] = []
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = {
          method: init?.method ?? 'GET',
          url: String(input),
          body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined
        }
        requests.push(request)
        return Response.json(await respond(request))
      },
      { preconnect: fetch.preconnect }
    )
  )
  let handleEvent: (event: WorkspaceEvent) => void = () => {}
  const eventsSpy = spyOn(workspaceEvents, 'useWorkspaceEvent').mockImplementation(handler => {
    handleEvent = handler
  })

  const root = createRoot(document.getElementById('root')!)
  cleanup = async () => {
    await act(async () => {
      root.unmount()
      queryClient.clear()
      await Bun.sleep(0)
    })
    notifyManager.setNotifyFunction(callback => callback())
    fetchSpy.mockRestore()
    eventsSpy.mockRestore()
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
  const render = (children: React.ReactNode) =>
    act(async () => {
      root.render(
        <Workspace id={WORKSPACE_ID}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </Workspace>
      )
    })
  return {
    queryClient,
    requests,
    render,
    cached: () => queryClient.getQueryData<WorkspaceState>(workspaceKeys.state(WORKSPACE_ID)),
    emit: (event: WorkspaceEvent) => act(() => handleEvent(event)),
    settle: () =>
      act(async () => {
        await Bun.sleep(10)
      })
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => (resolve = done))
  return { promise, resolve }
}

describe('workspace state writes', () => {
  test('a reply waits while a later write is in flight; the last reply becomes the cache', async () => {
    const replies: ReturnType<typeof deferred<WorkspaceState>>[] = []
    const fixture = mount(workspaceState({ selected: { overview: 'start' } }), async () => {
      const reply = deferred<WorkspaceState>()
      replies.push(reply)
      return reply.promise
    })
    const handles: { write?: (sessionId: string) => void } = {}
    function Probe() {
      useWorkspaceState(WORKSPACE_ID)
      const { mutate } = useWorkspaceStateWrite<string>(WORKSPACE_ID, {
        request: sessionId =>
          fetch(`/api/workspaces/${WORKSPACE_ID}/sessions/${sessionId}/selection`, {
            method: 'PUT'
          }).then(response => response.json() as Promise<WorkspaceState>),
        optimistic: (draft, sessionId) => {
          draft.selected.overview = sessionId
        },
        errorTitle: 'Couldn’t save selected chat'
      })
      useLayoutEffect(() => {
        handles.write = mutate
      })
      return null
    }
    await fixture.render(<Probe />)

    await act(async () => {
      handles.write!('first')
      handles.write!('second')
    })
    expect(fixture.cached()?.selected.overview).toBe('second')

    await fixture.settle()
    replies[0]!.resolve(workspaceState({ revision: 2, selected: { overview: 'first' } }))
    await fixture.settle()
    expect(fixture.cached()?.selected.overview).toBe('second')

    await fixture.settle()
    replies[1]!.resolve(workspaceState({ revision: 3, selected: { overview: 'second' } }))
    await fixture.settle()
    expect(fixture.cached()).toEqual(
      workspaceState({ revision: 3, selected: { overview: 'second' } })
    )
  })

  test('state:changed waits for writes in flight and never brings back an older copy', async () => {
    const reply = deferred<WorkspaceState>()
    const fixture = mount(workspaceState(), () => reply.promise)
    const handles: { pin?: (sessionId: string) => void } = {}
    function Probe() {
      useWorkspaceStateSync()
      const { pin } = usePinnedSession()
      useLayoutEffect(() => {
        handles.pin = pin
      })
      return null
    }
    await fixture.render(<Probe />)

    await act(async () => handles.pin!('mine'))
    fixture.emit({
      type: 'state:changed',
      workspaceId: WORKSPACE_ID,
      state: workspaceState({ revision: 4, pinnedSessionId: 'theirs' })
    })
    expect(fixture.cached()?.pinnedSessionId).toBe('mine')

    reply.resolve(workspaceState({ revision: 5, pinnedSessionId: 'mine' }))
    await fixture.settle()
    expect(fixture.cached()?.revision).toBe(5)

    fixture.emit({
      type: 'state:changed',
      workspaceId: WORKSPACE_ID,
      state: workspaceState({ revision: 4, pinnedSessionId: 'theirs' })
    })
    expect(fixture.cached()?.pinnedSessionId).toBe('mine')
    fixture.emit({
      type: 'state:changed',
      workspaceId: WORKSPACE_ID,
      state: workspaceState({ revision: 6 })
    })
    expect(fixture.cached()).toEqual(workspaceState({ revision: 6 }))
  })

  test('state:changed for a workspace this tab never loaded stays out of the cache', async () => {
    const fixture = mount(workspaceState(), async () => workspaceState())
    function Probe() {
      useWorkspaceStateSync()
      return null
    }
    await fixture.render(<Probe />)
    fixture.emit({ type: 'state:changed', workspaceId: 'other', state: workspaceState() })
    expect(fixture.queryClient.getQueryData(workspaceKeys.state('other'))).toBeUndefined()
  })
})

type Handles = {
  select?: (sessionId: string | null) => void
  unpin?: () => void
  shown?: string | null
}

type SelectionProbeProps = {
  handles: Handles
}

// Hands the overview selection and its actions to the test after each render.
function SelectionProbe({ handles }: SelectionProbeProps) {
  const [selectedSessionId, setSelectedSessionId] = useSelectedSession('overview')
  const { unpin } = usePinnedSession()
  useLayoutEffect(() => {
    Object.assign(handles, { select: setSelectedSessionId, unpin, shown: selectedSessionId })
  })
  return null
}

describe('selection and pin requests', () => {
  test('choosing a chat sends the chat the tab showed; New chat clears the current one', async () => {
    let server = workspaceState({ selected: { overview: 'session-1' } })
    const fixture = mount(server, async request => {
      const sessionId = decodeURIComponent(request.url.split('/sessions/')[1]!.split('/')[0]!)
      const selected = { ...server.selected }
      if (request.method === 'PUT') selected.overview = sessionId
      else if (selected.overview === sessionId) delete selected.overview
      server = { ...server, revision: server.revision + 1, selected }
      return server
    })
    const handles: Handles = {}
    await fixture.render(<SelectionProbe handles={handles} />)
    expect(handles.shown).toBe('session-1')

    await act(async () => handles.select!('session-2'))
    await fixture.settle()
    expect(handles.shown).toBe('session-2')
    await act(async () => handles.select!(null))
    await fixture.settle()
    expect(handles.shown).toBeNull()

    expect(fixture.requests).toEqual([
      {
        method: 'PUT',
        url: `/api/workspaces/${WORKSPACE_ID}/sessions/session-2/selection`,
        body: { tabId: 'overview', ifMatch: 'session-1' }
      },
      {
        method: 'DELETE',
        url: `/api/workspaces/${WORKSPACE_ID}/sessions/session-2/selection`,
        body: { tabId: 'overview' }
      }
    ])
    expect(fixture.cached()).toEqual(workspaceState({ revision: 3 }))
  })

  test('a pinned chat ignores tab choices until it is unpinned', async () => {
    const fixture = mount(
      workspaceState({ pinnedSessionId: 'pinned', selected: { overview: 'session-1' } }),
      async () => workspaceState({ revision: 2, selected: { overview: 'session-1' } })
    )
    const handles: Handles = {}
    await fixture.render(<SelectionProbe handles={handles} />)

    await act(async () => handles.select!('session-2'))
    expect(handles.shown).toBe('pinned')
    expect(fixture.requests).toEqual([])

    await act(async () => handles.unpin!())
    await fixture.settle()
    expect(handles.shown).toBe('session-1')
    expect(fixture.requests).toEqual([
      {
        method: 'DELETE',
        url: `/api/workspaces/${WORKSPACE_ID}/sessions/pinned/pin`,
        body: undefined
      }
    ])
  })
})
