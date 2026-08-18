import { afterEach, describe, expect, test } from 'bun:test'

import type { UpdateStatus } from '@/lib/types'

import { api } from './api'
import { __resetUpdateStateForTests, installUpdate, scheduleRestartForUpdate } from './update'

describe('update API', () => {
  afterEach(() => __resetUpdateStateForTests())

  test('reports a source checkout as unavailable without touching the registry', async () => {
    const response = await api.request('/api/update')
    const status = (await response.json()) as UpdateStatus

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(status.availableVersion).toBeNull()
  })

  test('refuses to update a source checkout', async () => {
    const response = await api.request('/api/update', { method: 'POST' })

    expect(response.status).toBe(409)
    expect(await response.text()).toBe('This moi install cannot be updated from the app.')
  })

  test('refuses a second update while one is in flight', async () => {
    // Park a real install mid-run: the second click must be told so, not
    // silently handed the first install's result.
    installUpdate({
      runningVersion: '0.5.2',
      analysis: {
        kind: 'global',
        root: '/home/u/.bun/install/global/node_modules/moi-computer',
        bin: '/home/u/.bun/bin/moi'
      },
      fetchLatest: async () => '0.6.0',
      detectManager: async () => 'bun',
      runManager: () => new Promise<number>(() => {}),
      readInstalledVersion: async () => '0.6.0'
    })
    await Bun.sleep(0)

    const response = await api.request('/api/update', { method: 'POST' })

    expect(response.status).toBe(409)
    expect(await response.text()).toBe('An update is already in progress.')
  })

  test('tells a click after a finished install that moi is restarting', async () => {
    await installUpdate({
      runningVersion: '0.5.2',
      analysis: {
        kind: 'global',
        root: '/home/u/.bun/install/global/node_modules/moi-computer',
        bin: '/home/u/.bun/bin/moi'
      },
      fetchLatest: async () => '0.6.0',
      detectManager: async () => 'bun',
      runManager: async () => 0,
      readInstalledVersion: async () => '0.6.0'
    })
    // A delay no test run reaches: firing it would SIGTERM the test process.
    scheduleRestartForUpdate(2 ** 30)

    const response = await api.request('/api/update', { method: 'POST' })

    expect(response.status).toBe(409)
    expect(await response.text()).toBe('An update is installed — moi is restarting.')
  })
})
