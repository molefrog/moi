import { describe, expect, test } from 'bun:test'
import { createNavigationRelay } from './navigation-relay'
import type { NavigationRequest } from '@/lib/navigation'

function client() {
  const requests: NavigationRequest[] = []
  return {
    requests,
    send: (data: string) => {
      requests.push(JSON.parse(data))
    }
  }
}

function presence(workspaceId: string | null, focused = false) {
  return { type: 'navigation:presence', workspaceId, focused }
}

describe('navigation delivery', () => {
  test('targets the last focused browser, retaining focus order after blur, and requires its acknowledgement', async () => {
    const relay = createNavigationRelay()
    const a = client(),
      b = client(),
      other = client()
    relay.receive(a, presence('ws', true))
    relay.receive(b, presence('ws', true))
    relay.receive(b, presence('ws', false))
    relay.receive(other, presence('elsewhere', true))
    let acknowledged = false
    const done = relay.navigate('ws', 'moi:/overview').then(() => {
      acknowledged = true
    })
    expect(a.requests).toHaveLength(0)
    expect(other.requests).toHaveLength(0)
    expect(b.requests).toHaveLength(1)
    const requestId = b.requests[0].requestId
    relay.receive(a, { type: 'navigation:result', requestId, ok: true })
    await Promise.resolve()
    expect(acknowledged).toBe(false)
    relay.receive(b, { type: 'navigation:result', requestId, ok: true })
    await done
    expect(acknowledged).toBe(true)
  })
  test('uses a sole browser even if it has never had focus', async () => {
    const relay = createNavigationRelay()
    const a = client()
    relay.receive(a, presence('ws'))
    const done = relay.navigate('ws', 'moi:/overview')
    relay.receive(a, { type: 'navigation:result', requestId: a.requests[0].requestId, ok: true })
    await done
  })
  test('rejects missing and ambiguous clients without broadcasting', async () => {
    const relay = createNavigationRelay()
    await expect(relay.navigate('ws', 'moi:/overview')).rejects.toThrow('No browser')
    const a = client(),
      b = client()
    relay.receive(a, presence('ws'))
    relay.receive(b, presence('ws'))
    await expect(relay.navigate('ws', 'moi:/overview')).rejects.toThrow('Several browsers')
    expect(a.requests).toHaveLength(0)
    expect(b.requests).toHaveLength(0)
  })
  test('disconnect and workspace switches cancel pending navigation and remove stale candidates', async () => {
    const relay = createNavigationRelay()
    const a = client()
    relay.receive(a, presence('ws', true))
    const disconnected = relay.navigate('ws', 'moi:/overview')
    relay.remove(a)
    await expect(disconnected).rejects.toThrow('disconnected')
    await expect(relay.navigate('ws', 'moi:/overview')).rejects.toThrow('No browser')
    relay.receive(a, presence('ws', true))
    const switched = relay.navigate('ws', 'moi:/overview')
    relay.receive(a, presence(null))
    await expect(switched).rejects.toThrow('switched workspaces')
  })
  test('propagates browser errors and times out without retrying', async () => {
    const relay = createNavigationRelay(10)
    const a = client()
    relay.receive(a, presence('ws', true))
    const failed = relay.navigate('ws', 'moi:/views/missing')
    relay.receive(a, {
      type: 'navigation:result',
      requestId: a.requests[0].requestId,
      error: 'View unavailable'
    })
    await expect(failed).rejects.toThrow('View unavailable')
    await expect(relay.navigate('ws', 'moi:/overview')).rejects.toThrow('timed out')
    expect(a.requests).toHaveLength(2)
    relay.receive(a, { type: 'navigation:result', requestId: a.requests[1].requestId, ok: true })
  })
})
