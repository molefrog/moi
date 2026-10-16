import { expect, spyOn, test } from 'bun:test'

import type { CodexThread } from './adapter'
import { listCodexThreads } from './thread-list'

type Call = { method: string; params?: Record<string, unknown> }

// thread/list rows carry no threadSource; thread/read reveals it per id.
function fakeClient(
  rows: CodexThread[],
  sources: Record<string, string>,
  options: { dbOnlyFails?: boolean; failReads?: Set<string> } = {}
) {
  const calls: Call[] = []
  const client = {
    rpc: async <T>(method: string, params?: Record<string, unknown>) => {
      calls.push({ method, params })
      if (method === 'thread/list') {
        if (params?.useStateDbOnly && options.dbOnlyFails)
          throw new Error('failed to list threads from state database')
        return { data: rows, nextCursor: null } as T
      }
      const id = params?.threadId as string
      if (options.failReads?.has(id)) throw new Error('read failed')
      return { thread: { id, threadSource: sources[id] } } as T
    }
  }
  return { client, calls }
}

test('lists from the state DB and hides agent-created tasks', async () => {
  const { client, calls } = fakeClient([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }], {
    a1: 'user',
    a2: 'agent_created_thread',
    a3: 'user'
  })
  const params = { cwd: '/workspace', limit: 100, sortKey: 'updated_at' }
  expect((await listCodexThreads(client, params)).map(t => t.id)).toEqual(['a1', 'a3'])
  expect(calls[0]).toEqual({ method: 'thread/list', params: { ...params, useStateDbOnly: true } })
  expect(calls.filter(c => c.method === 'thread/read')).toHaveLength(3)
  expect(calls[1].params).toEqual({ threadId: 'a1', includeTurns: false })

  // Sources are cached: a refresh reads only threads it has not seen.
  calls.length = 0
  expect((await listCodexThreads(client, params)).map(t => t.id)).toEqual(['a1', 'a3'])
  expect(calls.map(c => c.method)).toEqual(['thread/list'])
})

test('uses threadSource from the listing when Codex provides it', async () => {
  const { client, calls } = fakeClient(
    [
      { id: 'b1', threadSource: 'agent_created_thread' },
      { id: 'b2', threadSource: 'user' }
    ],
    {}
  )
  expect((await listCodexThreads(client, {})).map(t => t.id)).toEqual(['b2'])
  expect(calls.map(c => c.method)).toEqual(['thread/list'])
})

test('falls back to the rollout scan when the state DB listing fails', async () => {
  const logged = spyOn(console, 'error').mockImplementation(() => {})
  const { client, calls } = fakeClient([{ id: 'c1' }], { c1: 'user' }, { dbOnlyFails: true })
  try {
    expect((await listCodexThreads(client, { cwd: '/w' })).map(t => t.id)).toEqual(['c1'])
  } finally {
    logged.mockRestore()
  }
  expect(calls.filter(c => c.method === 'thread/list').map(c => c.params?.useStateDbOnly)).toEqual([
    true,
    undefined
  ])
})

test('keeps threads whose source could not be read and retries them', async () => {
  const failReads = new Set(['d1'])
  const { client, calls } = fakeClient(
    [{ id: 'd1' }],
    { d1: 'agent_created_thread' },
    { failReads }
  )
  expect((await listCodexThreads(client, {})).map(t => t.id)).toEqual(['d1'])
  failReads.clear()
  calls.length = 0
  expect(await listCodexThreads(client, {})).toEqual([])
  expect(calls.map(c => c.method)).toEqual(['thread/list', 'thread/read'])
})

test('reads a single page when asked', async () => {
  const calls: Call[] = []
  const client = {
    rpc: async <T>(method: string, params?: Record<string, unknown>) => {
      calls.push({ method, params })
      if (method === 'thread/read') return { thread: { id: params?.threadId } } as T
      return { data: [{ id: 'e1' }], nextCursor: 'more' } as T
    }
  }
  expect(
    (await listCodexThreads(client, { limit: 50 }, { allPages: false })).map(t => t.id)
  ).toEqual(['e1'])
  expect(calls.filter(c => c.method === 'thread/list')).toHaveLength(1)
})
