import { expect, test } from 'bun:test'

import { readCodexPages } from './pagination'

test('reads every page and preserves filters', async () => {
  const calls: unknown[] = []
  const rows = await readCodexPages<number>(
    {
      rpc: async <T>(_method: string, params?: Record<string, unknown>) => {
        calls.push(params)
        return (
          params?.cursor ? { data: [3], nextCursor: null } : { data: [1, 2], nextCursor: 'page-2' }
        ) as T
      }
    },
    'thread/list',
    { cwd: '/workspace', sortKey: 'updated_at' }
  )
  expect(rows).toEqual([1, 2, 3])
  expect(calls).toEqual([
    { cwd: '/workspace', sortKey: 'updated_at' },
    { cwd: '/workspace', sortKey: 'updated_at', cursor: 'page-2' }
  ])
})

test('fails on repeated cursors instead of hanging or silently losing rows', async () => {
  await expect(
    readCodexPages({ rpc: async <T>() => ({ data: [], nextCursor: 'loop' }) as T }, 'model/list')
  ).rejects.toThrow('repeated a page cursor')
})
