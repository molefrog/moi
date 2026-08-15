import { describe, expect, test } from 'bun:test'

import type { UpdateStatus } from '@/lib/types'

import { api } from './api'

describe('update API', () => {
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
})
