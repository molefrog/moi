import { expect, test } from 'bun:test'

import type { HarnessAvailability, WorkspaceEntry } from '@/lib/types'

import type { AgentUpdatedEvent } from './agent'
import { createAgentStore } from './agent'

const ws: WorkspaceEntry = { id: 'w1', path: '/tmp/w1', addedAt: '2026-01-01T00:00:00.000Z' }

const signedOut: HarnessAvailability = {
  available: false,
  reason: 'Signed out',
  loginCommand: 'codex login'
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
  const store = createAgentStore({
    probe: async () => {
      probes++
      return { available: true }
    },
    startLogin: async () => ({}),
    publish: () => {},
    availabilityTtlMs: 60_000
  })

  expect(await store.getAvailability(ws)).toEqual({ available: true })
  expect(await store.getAvailability(ws)).toEqual({ available: true })
  expect(probes).toBe(1)

  store.invalidate(ws.id)
  expect(await store.getAvailability(ws)).toEqual({ available: true })
  expect(probes).toBe(2)
})

test('refresh bypasses the TTL and publishes even when nothing else asked', async () => {
  const events: AgentUpdatedEvent[] = []
  let probes = 0
  let available = true
  const store = createAgentStore({
    probe: async () => {
      probes++
      return { available }
    },
    startLogin: async () => ({}),
    publish: event => events.push(event),
    availabilityTtlMs: 60_000
  })

  expect(await store.getAvailability(ws)).toEqual({ available: true })
  expect(probes).toBe(1)

  // The provider was signed out from outside moi; the cache doesn't know yet.
  available = false
  expect(await store.getAvailability(ws)).toEqual({ available: true })
  expect(probes).toBe(1)

  expect(await store.refresh(ws)).toEqual({ available: false })
  expect(probes).toBe(2)
  expect(events.at(-1)?.availability).toEqual({ available: false })
  expect(await store.getAvailability(ws)).toEqual({ available: false })
})

test('concurrent reads share one in-flight probe', async () => {
  let probes = 0
  const store = createAgentStore({
    probe: async () => {
      probes++
      await Bun.sleep(20)
      return { available: true }
    },
    startLogin: async () => ({}),
    publish: () => {}
  })

  const [a, b] = await Promise.all([store.getAvailability(ws), store.getAvailability(ws)])
  expect(a).toEqual({ available: true })
  expect(b).toEqual({ available: true })
  expect(probes).toBe(1)
})

test('a second login start joins the pending ceremony', async () => {
  let starts = 0
  const store = createAgentStore({
    probe: async () => signedOut,
    startLogin: async () => {
      starts++
      return { url: 'https://example.com/login' }
    },
    publish: () => {},
    loginPollMs: 10_000
  })

  const [first, second] = await Promise.all([store.startLogin(ws), store.startLogin(ws)])
  const third = await store.startLogin(ws)
  expect(first).toEqual({ url: 'https://example.com/login' })
  expect(second).toEqual({ url: 'https://example.com/login' })
  expect(third).toEqual({ url: 'https://example.com/login' })
  expect(starts).toBe(1)
  expect(store.getLogin(ws.id)).toEqual({ state: 'pending', url: 'https://example.com/login' })
})

test('publishes the completed login and clears the ceremony', async () => {
  const events: AgentUpdatedEvent[] = []
  let loggedIn = false
  const store = createAgentStore({
    probe: async () => (loggedIn ? { available: true } : signedOut),
    startLogin: async () => ({ url: 'https://example.com/login' }),
    publish: event => events.push(event),
    availabilityTtlMs: 0,
    loginPollMs: 10,
    loginDeadlineMs: 60_000
  })

  await store.getAvailability(ws)
  await store.startLogin(ws)
  expect(events.at(-1)?.login).toEqual({ state: 'pending', url: 'https://example.com/login' })

  loggedIn = true
  await until(() => events.at(-1)?.availability.available === true)
  expect(events.at(-1)?.login).toBeUndefined()
  expect(store.getLogin(ws.id)).toBeUndefined()
  expect(await store.getAvailability(ws)).toEqual({ available: true })
})

test('a ceremony that never lands fails at the deadline', async () => {
  const events: AgentUpdatedEvent[] = []
  const store = createAgentStore({
    probe: async () => signedOut,
    startLogin: async () => ({ url: 'https://example.com/login' }),
    publish: event => events.push(event),
    availabilityTtlMs: 0,
    loginPollMs: 10,
    loginDeadlineMs: 30
  })

  await store.startLogin(ws)
  await until(() => store.getLogin(ws.id)?.state === 'failed')
  expect(events.at(-1)?.login).toEqual({
    state: 'failed',
    reason: 'Sign-in did not complete. Try again'
  })

  // A failed ceremony does not block a fresh start.
  let starts = 0
  const restarted = createAgentStore({
    probe: async () => signedOut,
    startLogin: async () => {
      starts++
      return {}
    },
    publish: () => {},
    loginPollMs: 10,
    loginDeadlineMs: 30
  })
  await restarted.startLogin(ws)
  await until(() => restarted.getLogin(ws.id)?.state === 'failed')
  await restarted.startLogin(ws)
  expect(starts).toBe(2)
})

test('a failed provider start clears the ceremony for retry', async () => {
  let starts = 0
  const store = createAgentStore({
    probe: async () => signedOut,
    startLogin: async () => {
      starts++
      if (starts === 1) throw new Error('Codex did not return a browser login URL')
      return { url: 'https://example.com/retry' }
    },
    publish: () => {},
    loginPollMs: 10_000
  })

  await expect(store.startLogin(ws)).rejects.toThrow('Codex did not return a browser login URL')
  expect(store.getLogin(ws.id)).toBeUndefined()
  expect(await store.startLogin(ws)).toEqual({ url: 'https://example.com/retry' })
  expect(starts).toBe(2)
})
