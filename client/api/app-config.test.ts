import { afterEach, expect, test } from 'bun:test'
import type { ClientAppConfig } from '@/lib/types'

import { loadAppConfig } from './app-config'

const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch')

afterEach(() => {
  if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch)
  else Reflect.deleteProperty(globalThis, 'fetch')
})

test('startup receives confirmed config while a failed refresh cannot enable a local profile from cached config', async () => {
  const config: ClientAppConfig = {
    cloudDemo: false,
    experimental: { collab: true },
    demoInstallUrl: 'https://moi.computer'
  }
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => Response.json(config)
  })
  expect(await loadAppConfig()).toEqual(config)
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => Response.json({}, { status: 503 })
  })
  expect(await loadAppConfig()).toBeUndefined()
})
