import { expect, spyOn, test } from 'bun:test'

import type { CodexThread } from './adapter'
import { listCodexThreads } from './thread-list'
import { CodexRpcError } from './transport'

type Call = { method: string; params?: Record<string, unknown> }

const workspacePath = '/workspace'
const listParams = { cwd: workspacePath, limit: 100, sortKey: 'updated_at', modelProviders: [] }

// thread/list rows carry no threadSource; thread/read reveals it per id.
function fakeClient(
  rows: CodexThread[],
  sources: Record<string, string>,
  options: { dbOnlyError?: Error; failReads?: Set<string> } = {}
) {
  const calls: Call[] = []
  const client = {
    rpc: async <T>(method: string, params?: Record<string, unknown>) => {
      calls.push({ method, params })
      if (method === 'thread/list') {
        if (params?.useStateDbOnly && options.dbOnlyError) throw options.dbOnlyError
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
  expect((await listCodexThreads(client, workspacePath)).map(t => t.id)).toEqual(['a1', 'a3'])
  expect(calls[0]).toEqual({
    method: 'thread/list',
    params: { ...listParams, useStateDbOnly: true }
  })
  expect(calls.filter(c => c.method === 'thread/read')).toHaveLength(3)
  expect(calls[1].params).toEqual({ threadId: 'a1', includeTurns: false })

  // Sources are cached: a refresh reads only threads it has not seen.
  calls.length = 0
  expect((await listCodexThreads(client, workspacePath)).map(t => t.id)).toEqual(['a1', 'a3'])
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
  expect((await listCodexThreads(client, workspacePath)).map(t => t.id)).toEqual(['b2'])
  expect(calls.map(c => c.method)).toEqual(['thread/list'])
})

// CLI 0.162's rollout error is wrapped by the thread store and app-server.
const databaseError = () =>
  new CodexRpcError(
    'failed to list threads: thread-store internal error: failed to list threads: failed to list threads from state database',
    -32603
  )

test('falls back to the rollout scan for the known state DB listing error', async () => {
  const logged = spyOn(console, 'error').mockImplementation(() => {})
  const { client, calls } = fakeClient(
    [{ id: 'c1' }],
    { c1: 'user' },
    { dbOnlyError: databaseError() }
  )
  try {
    expect((await listCodexThreads(client, workspacePath)).map(t => t.id)).toEqual(['c1'])
  } finally {
    logged.mockRestore()
  }
  expect(calls.filter(c => c.method === 'thread/list')).toEqual([
    { method: 'thread/list', params: { ...listParams, useStateDbOnly: true } },
    { method: 'thread/list', params: { ...listParams, useStateDbOnly: false } }
  ])
})

test.each([
  new Error('Codex request timed out: thread/list'),
  new Error('Codex disconnected'),
  new CodexRpcError('unrelated server failure', -32603),
  new CodexRpcError('invalid cwd', -32602),
  new Error('failed to list threads from state database')
])('does not scan rollouts after %s', async error => {
  const { client, calls } = fakeClient([], {}, { dbOnlyError: error })
  await expect(listCodexThreads(client, workspacePath)).rejects.toBe(error)
  expect(calls).toEqual([
    { method: 'thread/list', params: { ...listParams, useStateDbOnly: true } }
  ])
})

test('a timeout on a later page propagates without restarting or returning partial history', async () => {
  const calls: Call[] = []
  const error = new Error('Codex request timed out: thread/list')
  const client = {
    rpc: async <T>(method: string, params?: Record<string, unknown>) => {
      calls.push({ method, params })
      if (params?.cursor) throw error
      return { data: [{ id: 'first-page-chat' }], nextCursor: 'page-2' } as T
    }
  }
  await expect(listCodexThreads(client, workspacePath)).rejects.toBe(error)
  expect(calls).toEqual([
    { method: 'thread/list', params: { ...listParams, useStateDbOnly: true } },
    { method: 'thread/list', params: { ...listParams, useStateDbOnly: true, cursor: 'page-2' } }
  ])
})

test('a failed compatibility scan propagates instead of returning empty history', async () => {
  const calls: Call[] = []
  const error = new Error('Codex request timed out: thread/list')
  const client = {
    rpc: async <T>(method: string, params?: Record<string, unknown>): Promise<T> => {
      calls.push({ method, params })
      throw params?.useStateDbOnly ? databaseError() : error
    }
  }
  const logged = spyOn(console, 'error').mockImplementation(() => {})
  try {
    await expect(listCodexThreads(client, workspacePath)).rejects.toBe(error)
    expect(calls).toHaveLength(2)
  } finally {
    logged.mockRestore()
  }
})

test('keeps threads whose source could not be read and retries them', async () => {
  const failReads = new Set(['d1'])
  const { client, calls } = fakeClient(
    [{ id: 'd1' }],
    { d1: 'agent_created_thread' },
    { failReads }
  )
  expect((await listCodexThreads(client, workspacePath)).map(t => t.id)).toEqual(['d1'])
  failReads.clear()
  calls.length = 0
  expect(await listCodexThreads(client, workspacePath)).toEqual([])
  expect(calls.map(c => c.method)).toEqual(['thread/list', 'thread/read'])
})

test('keeps paging past a page of agent-created tasks', async () => {
  const client = {
    rpc: async <T>(method: string, params?: Record<string, unknown>) => {
      const id = params?.threadId as string
      if (method === 'thread/read')
        return {
          thread: { id, threadSource: id.startsWith('task') ? 'agent_created_thread' : 'user' }
        } as T
      return (
        params?.cursor
          ? { data: [{ id: 'chat-1' }], nextCursor: null }
          : { data: [{ id: 'task-1' }, { id: 'task-2' }], nextCursor: 'page-2' }
      ) as T
    }
  }
  expect((await listCodexThreads(client, workspacePath)).map(t => t.id)).toEqual(['chat-1'])
})
