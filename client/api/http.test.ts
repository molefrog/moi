import { afterEach, describe, expect, mock, test } from 'bun:test'

import { jsonRequest, requestJson, requestVoid } from './http'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('request helpers', () => {
  test('returns parsed JSON for successful requests', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(Response.json({ ok: true }))
    ) as unknown as typeof fetch

    await expect(requestJson<{ ok: boolean }>('/api/test')).resolves.toEqual({ ok: true })
  })

  test('uses the response body for request errors', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Useful detail', { status: 400 }))
    ) as unknown as typeof fetch

    await expect(requestVoid('/api/test', undefined, 'Fallback')).rejects.toThrow('Useful detail')
  })

  test('builds JSON request options', () => {
    expect(jsonRequest('PUT', { name: 'Moi' })).toEqual({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":"Moi"}'
    })
  })
})
