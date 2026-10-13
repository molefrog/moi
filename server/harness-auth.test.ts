import { expect, spyOn, test } from 'bun:test'

import type { HarnessAvailability, WorkspaceEntry } from '@/lib/types'

import type { HarnessUpdatedEvent } from './harness-auth'
import { createHarnessStore as createStore, type HarnessStoreOptions } from './harness-auth'

function createHarnessStore(options: HarnessStoreOptions) {
  const store = createStore({
    ...options,
    onAuthChanged: async () => {
      await store.refresh(ws)
    }
  })
  return store
}

const ws: WorkspaceEntry = { id: 'w1', path: '/tmp/w1', addedAt: '2026-01-01T00:00:00.000Z' }

const signedOut: HarnessAvailability = {
  status: 'login-required',
  reason: 'Signed out'
}

async function until(cond: () => boolean, ms = 2_000) {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time')
    await Bun.sleep(5)
  }
}

test('serves the cached availability within the TTL and re-probes after invalidate', async () => {
  let probes = 0
  const store = createHarnessStore({
    probe: async () => {
      probes++
      return { status: 'available' }
    },
    startLogin: async () => ({}),
    publish: () => {},
    availabilityTtlMs: 60_000
  })

  expect(await store.getAvailability(ws)).toEqual({ status: 'available' })
  expect(await store.getAvailability(ws)).toEqual({ status: 'available' })
  expect(probes).toBe(1)

  store.invalidate(ws)
  expect(await store.getAvailability(ws)).toEqual({ status: 'available' })
  expect(probes).toBe(2)
})

test('refresh bypasses the TTL and publishes even when nothing else asked', async () => {
  const events: HarnessUpdatedEvent[] = []
  let probes = 0
  let available = true
  const store = createHarnessStore({
    probe: async () => {
      probes++
      return available ? { status: 'available' } : { status: 'unavailable', reason: 'Signed out' }
    },
    startLogin: async () => ({}),
    publish: event => events.push(event),
    availabilityTtlMs: 60_000
  })

  expect(await store.getAvailability(ws)).toEqual({ status: 'available' })
  expect(probes).toBe(1)

  // The provider was signed out from outside moi; the cache doesn't know yet.
  available = false
  expect(await store.getAvailability(ws)).toEqual({ status: 'available' })
  expect(probes).toBe(1)

  expect(await store.refresh(ws)).toEqual({ status: 'unavailable', reason: 'Signed out' })
  expect(probes).toBe(2)
  expect(events.at(-1)?.availability).toEqual({ status: 'unavailable', reason: 'Signed out' })
  expect(await store.getAvailability(ws)).toEqual({
    status: 'unavailable',
    reason: 'Signed out'
  })
})

test('concurrent reads share one in-flight probe', async () => {
  let probes = 0
  const store = createHarnessStore({
    probe: async () => {
      probes++
      await Bun.sleep(20)
      return { status: 'available' }
    },
    startLogin: async () => ({}),
    publish: () => {}
  })

  const [a, b] = await Promise.all([store.getAvailability(ws), store.getAvailability(ws)])
  expect(a).toEqual({ status: 'available' })
  expect(b).toEqual({ status: 'available' })
  expect(probes).toBe(1)
})

test('turns a rejected probe into a cached unavailable result', async () => {
  const errorLog = spyOn(console, 'error').mockImplementation(() => {})
  let probes = 0
  const store = createHarnessStore({
    probe: async () => {
      probes++
      throw new Error('gateway down')
    },
    startLogin: async () => ({}),
    publish: () => {},
    availabilityTtlMs: 60_000
  })

  try {
    const expected: HarnessAvailability = {
      status: 'unavailable',
      reason: 'Could not check agent availability'
    }
    expect(await store.getAvailability(ws)).toEqual(expected)
    expect(await store.getAvailability(ws)).toEqual(expected)
    expect(probes).toBe(1)
    expect(errorLog).toHaveBeenCalledTimes(1)
  } finally {
    errorLog.mockRestore()
  }
})

test('a second login start joins the pending ceremony', async () => {
  let starts = 0
  const store = createHarnessStore({
    probe: async () => signedOut,
    startLogin: async () => {
      starts++
      return { url: 'https://example.com/login' }
    },
    publish: () => {},
    loginPollMs: 10_000
  })

  const [first, second] = await Promise.all([
    store.startLogin('claude-code'),
    store.startLogin('claude-code')
  ])
  const third = await store.startLogin('claude-code')
  expect(first).toEqual({ url: 'https://example.com/login' })
  expect(second).toEqual({ url: 'https://example.com/login' })
  expect(third).toEqual({ url: 'https://example.com/login' })
  expect(starts).toBe(1)
  expect(store.getLogin('claude-code')).toEqual({
    state: 'pending',
    url: 'https://example.com/login'
  })
})

test('a second login start restarts a pending URL-less provider flow', async () => {
  let starts = 0
  const store = createHarnessStore({
    probe: async () => signedOut,
    startLogin: async () => {
      starts++
      return {}
    },
    publish: () => {},
    loginPollMs: 10_000
  })

  expect(await store.startLogin('claude-code')).toEqual({})
  expect(await store.startLogin('claude-code')).toEqual({})
  expect(starts).toBe(2)
  expect(store.getLogin('claude-code')).toEqual({ state: 'pending' })
})

test('publishes the completed login and clears the ceremony', async () => {
  const events: HarnessUpdatedEvent[] = []
  let loggedIn = false
  const store = createHarnessStore({
    probe: async () => (loggedIn ? { status: 'available' } : signedOut),
    startLogin: async () => ({ url: 'https://example.com/login' }),
    publish: event => events.push(event),
    availabilityTtlMs: 0,
    loginPollMs: 10,
    loginDeadlineMs: 60_000
  })

  await store.getAvailability(ws)
  await store.startLogin('claude-code')
  expect(events.at(-1)?.login).toEqual({ state: 'pending', url: 'https://example.com/login' })

  loggedIn = true
  await until(() => events.at(-1)?.availability.status === 'available')
  expect(events.at(-1)?.login).toBeUndefined()
  expect(store.getLogin('claude-code')).toBeUndefined()
  expect(await store.getAvailability(ws)).toEqual({ status: 'available' })
})

test('publishes one unavailable transition during login and keeps watching for recovery', async () => {
  const events: HarnessUpdatedEvent[] = []
  let probes = 0
  let availability: HarnessAvailability = signedOut
  const store = createHarnessStore({
    probe: async () => {
      probes++
      return availability
    },
    startLogin: async () => ({ url: 'https://example.com/login' }),
    publish: event => events.push(event),
    availabilityTtlMs: 0,
    loginPollMs: 5,
    loginDeadlineMs: 60_000
  })

  await store.getAvailability(ws)
  await store.startLogin('claude-code')
  availability = { status: 'unavailable', reason: 'Codex app-server exited' }

  await until(() => probes >= 4)
  const unavailableEvents = events.filter(event => event.availability.status === 'unavailable')
  expect(unavailableEvents).toHaveLength(1)
  expect(unavailableEvents[0]?.login).toEqual({
    state: 'pending',
    url: 'https://example.com/login'
  })

  availability = { status: 'available' }
  await until(() => events.at(-1)?.availability.status === 'available')
  expect(events.at(-1)?.login).toBeUndefined()
  expect(store.getLogin('claude-code')).toBeUndefined()
})

test('a ceremony that never lands fails at the deadline', async () => {
  const events: HarnessUpdatedEvent[] = []
  const store = createHarnessStore({
    probe: async () => signedOut,
    startLogin: async () => ({ url: 'https://example.com/login' }),
    publish: event => events.push(event),
    availabilityTtlMs: 0,
    loginPollMs: 10,
    loginDeadlineMs: 30
  })

  await store.startLogin('claude-code')
  await until(() => store.getLogin('claude-code')?.state === 'failed')
  expect(events.at(-1)?.login).toEqual({
    state: 'failed',
    reason: 'Sign-in did not complete. Try again'
  })

  // A failed ceremony does not block a fresh start.
  let starts = 0
  const restarted = createHarnessStore({
    probe: async () => signedOut,
    startLogin: async () => {
      starts++
      return {}
    },
    publish: () => {},
    loginPollMs: 10,
    loginDeadlineMs: 30
  })
  await restarted.startLogin('claude-code')
  await until(() => restarted.getLogin('claude-code')?.state === 'failed')
  await restarted.startLogin('claude-code')
  expect(starts).toBe(2)
})

test('a failed provider start clears the ceremony for retry', async () => {
  let starts = 0
  const store = createHarnessStore({
    probe: async () => signedOut,
    startLogin: async () => {
      starts++
      if (starts === 1) throw new Error('Codex did not return a browser login URL')
      return { url: 'https://example.com/retry' }
    },
    publish: () => {},
    loginPollMs: 10_000
  })

  await expect(store.startLogin('claude-code')).rejects.toThrow(
    'Codex did not return a browser login URL'
  )
  expect(store.getLogin('claude-code')).toBeUndefined()
  expect(await store.startLogin('claude-code')).toEqual({ url: 'https://example.com/retry' })
  expect(starts).toBe(2)
})

test('workspace invalidation does not clear global harness login', async () => {
  const store = createHarnessStore({
    probe: async () => signedOut,
    startLogin: async () => ({ url: 'https://example.com/login' }),
    publish: () => {},
    loginPollMs: 10_000
  })
  await store.startLogin('codex')
  store.invalidate({ ...ws, type: 'codex' })
  expect(store.getLogin('codex')?.state).toBe('pending')
  expect(store.getLogin('claude-code')).toBeUndefined()
  store.invalidate('codex')
})

test('invalidating a context during login startup prevents a stale watcher', async () => {
  let finish!: (result: { url: string }) => void
  const store = createHarnessStore({
    probe: async () => signedOut,
    startLogin: () =>
      new Promise(resolve => {
        finish = resolve
      }),
    publish: () => {
      throw new Error('Invalidated login must not publish')
    }
  })
  const context = 'codex'
  const started = store.startLogin(context)
  store.invalidate(context)
  finish({ url: 'https://example.com/login' })
  await started
  expect(store.getLogin(context)).toBeUndefined()
})

test('one global login updates multiple workspaces without sharing their readiness', async () => {
  const first = { ...ws, type: 'codex' as const }
  const second = { ...first, id: 'w2', path: '/tmp/w2' }
  const events: HarnessUpdatedEvent[] = []
  let loggedIn = false
  let starts = 0
  const store = createStore({
    probe: async context => {
      if (typeof context !== 'string' && context.id === second.id) return signedOut
      return loggedIn ? { status: 'available' } : signedOut
    },
    startLogin: async () => {
      starts++
      return { url: 'https://example.com/login' }
    },
    publish: event => events.push(event),
    onAuthChanged: async () => {
      await Promise.all([store.refresh(first), store.refresh(second)])
    },
    loginPollMs: 5
  })
  await Promise.all([store.startLogin('codex'), store.startLogin('codex')])
  expect(starts).toBe(1)
  expect(events.filter(event => event.login?.state === 'pending')).toHaveLength(2)
  loggedIn = true
  await until(() =>
    events.some(
      event => event.workspaceId === first.id && event.availability.status === 'available'
    )
  )
  expect(store.getLogin('codex')).toBeUndefined()
  expect(await store.getAvailability(second)).toEqual(signedOut)
  expect(events.at(-1)?.login).toBeUndefined()
})
