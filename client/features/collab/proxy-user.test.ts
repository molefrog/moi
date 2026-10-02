import { afterEach, expect, test } from 'bun:test'

import { loadProxyUser } from './proxy-user'

const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch')

afterEach(() => {
  if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch)
  else Reflect.deleteProperty(globalThis, 'fetch')
})

function respond(value: unknown, status = 200) {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => Response.json(value, { status })
  })
}

test('proxy loading distinguishes confirmed local mode from signed-out authentication', async () => {
  respond({})
  expect(await loadProxyUser()).toEqual({})
  respond({ provider: 'cloudflare-access' })
  expect(await loadProxyUser()).toEqual({ provider: 'cloudflare-access' })
})

test('failed and malformed proxy responses cannot confirm local mode', async () => {
  respond({}, 503)
  expect(await loadProxyUser()).toBeUndefined()
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => {
      throw new Error('Network unavailable')
    }
  })
  expect(await loadProxyUser()).toBeUndefined()
  for (const value of [null, [], 'invalid', { provider: 'unknown' }, { profile: { id: 'fake' } }]) {
    respond(value)
    expect(await loadProxyUser()).toBeUndefined()
  }
})
