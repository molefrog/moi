import { expect, test } from 'bun:test'

import { createViewToolRelay } from './view-tool-relay'

function client() {
  const messages: Record<string, unknown>[] = []
  return {
    messages,
    send(data: string) {
      messages.push(JSON.parse(data))
    }
  }
}

test('routes once and accepts only the selected socket response', async () => {
  const relay = createViewToolRelay()
  const a = client(),
    b = client()
  relay.message(a, { type: 'view-tool:presence', workspaceId: 'a', views: ['orders'] })
  relay.message(b, { type: 'view-tool:presence', workspaceId: 'b', views: ['orders'] })
  const result = relay.call('a', 'orders', 'set_filter', {})
  expect(a.messages).toHaveLength(1)
  expect(b.messages).toHaveLength(0)
  const requestId = a.messages[0].requestId
  relay.message(b, { type: 'view-tool:result', requestId, result: 'wrong' })
  relay.message(a, { type: 'view-tool:result', requestId, result: { status: 'overdue' } })
  expect(await result).toEqual({ status: 'overdue' })
  relay.message(a, { type: 'view-tool:result', requestId, result: 'duplicate' })
})

test('unavailable and ambiguous views never dispatch', async () => {
  const relay = createViewToolRelay()
  await expect(relay.call('a', 'orders', 'x', {})).rejects.toThrow('View unavailable')
  const a = client(),
    b = client()
  for (const socket of [a, b])
    relay.message(socket, { type: 'view-tool:presence', workspaceId: 'a', views: ['orders'] })
  await expect(relay.call('a', 'orders', 'x', {})).rejects.toThrow('multiple browser clients')
  expect(a.messages).toHaveLength(0)
  expect(b.messages).toHaveLength(0)
})

test('disconnect settles pending calls and removes presence', async () => {
  const relay = createViewToolRelay(),
    a = client()
  relay.message(a, { type: 'view-tool:presence', workspaceId: 'a', views: ['orders'] })
  const result = relay.call('a', 'orders', 'x', {})
  relay.disconnect(a)
  await expect(result).rejects.toThrow('may already have changed')
  await expect(relay.call('a', 'orders', 'x', {})).rejects.toThrow('View unavailable')
})

test('timeout cancels only the target and rejects without retrying', async () => {
  const relay = createViewToolRelay(10),
    a = client()
  relay.message(a, { type: 'view-tool:presence', workspaceId: 'a', views: ['orders'] })
  await expect(relay.call('a', 'orders', 'x', {})).rejects.toThrow('do not retry automatically')
  expect(a.messages.map(m => m.type)).toEqual(['view-tool:call', 'view-tool:cancel'])
})
