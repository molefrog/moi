import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { QueryClient, QueryObserver } from '@tanstack/react-query'

import { workspaceKeys } from '@/client/api/workspace-keys'
import { applyEvents, emptyViewState } from '@/lib/format'
import type { StreamEvent, ViewState } from '@/lib/types'

import { reduceChatFrame } from './chat-frames'
import { sessionViewOptions } from './session-view'

const workspaceId = 'workspace'
const sessionId = 'session'
const key = workspaceKeys.events(workspaceId, sessionId)
let client: QueryClient
const fetchTarget: {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
} = globalThis
let fetchMock: ReturnType<typeof spyOn<typeof fetchTarget, 'fetch'>>

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  fetchMock = spyOn(fetchTarget, 'fetch')
})

afterEach(() => {
  client.clear()
  fetchMock.mockRestore()
})

function turn(id: string, text = id): StreamEvent {
  return {
    kind: 'turn',
    turn: { id, role: 'assistant', origin: { kind: 'user-input' }, parts: [{ type: 'text', text }] }
  }
}

function receive(event: StreamEvent, sid = sessionId) {
  reduceChatFrame(
    { ...event, workspaceId, sessionId: sid },
    { queryClient: client, sendMessage: () => {}, onWorkspaceSwitch: null }
  )
}

test('first load retains socket events received before the cache exists', async () => {
  const response = Promise.withResolvers<Response>()
  fetchMock.mockImplementation(() => response.promise)
  const loaded = client.fetchQuery(sessionViewOptions(client, workspaceId, sessionId))
  receive(turn('live'))
  receive(turn('other'), 'another-session')
  expect(client.getQueryData<ViewState>(key)).toBeUndefined()
  response.resolve(Response.json([turn('history')]))
  await loaded
  expect(client.getQueryData<ViewState>(key)).toEqual(applyEvents([turn('history'), turn('live')]))
})

test('reconnect merges fetched history with live upserts, notices and results', async () => {
  client.setQueryData(key, applyEvents([turn('cached')]))
  await client.invalidateQueries({ queryKey: key, refetchType: 'none' })
  const response = Promise.withResolvers<Response>()
  fetchMock.mockImplementation(() => response.promise)
  const loaded = client.fetchQuery(sessionViewOptions(client, workspaceId, sessionId))
  const live: StreamEvent[] = [
    turn('updated', 'new text'),
    turn('live'),
    { kind: 'notice', notice: { id: 'notice', kind: 'compact', at: 'now' } },
    { kind: 'result', result: { subtype: 'success' } }
  ]
  for (const event of live) receive(event)
  expect(client.getQueryData<ViewState>(key)?.turns.at(-1)?.id).toBe('live')
  const history = [turn('cached'), turn('missed-while-disconnected'), turn('updated', 'old text')]
  response.resolve(Response.json(history))
  await loaded
  expect(client.getQueryData<ViewState>(key)).toEqual(applyEvents([...history, ...live]))
})

test('HTTP errors keep cached history and permit retry', async () => {
  const existing = applyEvents([turn('cached')])
  client.setQueryData(key, existing)
  await client.invalidateQueries({ queryKey: key, refetchType: 'none' })
  fetchMock.mockResolvedValueOnce(new Response('Backend unavailable', { status: 503 }))
  await expect(
    client.fetchQuery(sessionViewOptions(client, workspaceId, sessionId))
  ).rejects.toThrow('Backend unavailable')
  expect(client.getQueryData<ViewState>(key)).toEqual(existing)
  expect(client.getQueryState(key)?.status).toBe('error')
  // An event after failure must not leak into the next request's buffer.
  receive(turn('after-failure'))
  await client.invalidateQueries({ queryKey: key, refetchType: 'none' })
  fetchMock.mockResolvedValueOnce(Response.json([turn('recovered')]))
  await client.fetchQuery(sessionViewOptions(client, workspaceId, sessionId))
  expect(client.getQueryData<ViewState>(key)).toEqual(applyEvents([turn('recovered')]))
})

test('an initial failure is retried when the chat remounts', async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }))
  const options = sessionViewOptions(client, workspaceId, sessionId)
  await expect(client.fetchQuery(options)).rejects.toThrow('Couldn’t load chat')
  expect(client.getQueryData<ViewState>(key)).toBeUndefined()
  const response = Promise.withResolvers<Response>()
  fetchMock.mockImplementation(() => response.promise)
  const observer = new QueryObserver(client, options)
  const unsubscribe = observer.subscribe(() => {})
  try {
    expect(fetchMock).toHaveBeenCalledTimes(2)
    response.resolve(Response.json([]))
    await client.fetchQuery(options)
    expect(client.getQueryData<ViewState>(key)).toEqual(emptyViewState())
  } finally {
    unsubscribe()
  }
})

test('automatic retry recovers an HTTP failure', async () => {
  fetchMock
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json([turn('recovered')]))
  await client.fetchQuery({
    ...sessionViewOptions(client, workspaceId, sessionId),
    retry: 1,
    retryDelay: 0
  })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(client.getQueryData<ViewState>(key)).toEqual(applyEvents([turn('recovered')]))
})

test('cancelling a fetch aborts its request and leaves the next load independent', async () => {
  let requestSignal: AbortSignal | null | undefined
  fetchMock.mockImplementation(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        requestSignal = init?.signal
        requestSignal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        )
      })
  )
  const loaded = client.fetchQuery(sessionViewOptions(client, workspaceId, sessionId))
  const rejected = loaded.then(
    () => false,
    () => true
  )
  receive(turn('cancelled'))
  await client.cancelQueries({ queryKey: key })
  expect(await rejected).toBe(true)
  expect(requestSignal?.aborted).toBe(true)
  fetchMock.mockResolvedValueOnce(Response.json([turn('next-load')]))
  await client.fetchQuery(sessionViewOptions(client, workspaceId, sessionId))
  expect(client.getQueryData<ViewState>(key)).toEqual(applyEvents([turn('next-load')]))
})
