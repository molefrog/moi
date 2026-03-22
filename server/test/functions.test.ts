import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { parse, stringify } from 'devalue'
import { join } from 'path'

import { callFunction } from '../functions'

const FIXTURES = join(import.meta.dir, '__fixtures__')

// Override the MEI_FUNCTIONS_DIR so the worker loads from test fixtures
process.env.MEI_FUNCTIONS_DIR = FIXTURES

describe('callFunction (via worker)', () => {
  test('calls a function and returns result', async () => {
    const result = parse(await callFunction('with-server', 'getWeather', stringify(['NYC'])))

    expect(result).toEqual({ city: 'NYC', temp: 72 })
  })

  test('rejects on unknown module', async () => {
    await expect(callFunction('nope', 'foo', stringify([]))).rejects.toThrow('not found')
  })

  test('rejects on unknown function', async () => {
    await expect(callFunction('with-server', 'nonexistent', stringify([]))).rejects.toThrow(
      'not a function'
    )
  })

  test('rejects on function error', async () => {
    await expect(callFunction('error', 'failHard', stringify([]))).rejects.toThrow(
      'intentional test error'
    )
  })

  test('handles devalue types round-trip', async () => {
    const result = parse(await callFunction('types', 'getDate', stringify([])))
    expect(result).toBeInstanceOf(Date)
  })
})

describe('/_mei/fn endpoint', () => {
  let server: ReturnType<typeof Bun.serve>
  let baseUrl: string

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const path = new URL(req.url).pathname

        if (req.method === 'POST' && path.startsWith('/_mei/fn/')) {
          const parts = path.replace('/_mei/fn/', '').split('/')
          if (parts.length !== 2) return new Response('Bad request', { status: 400 })

          const [module, name] = parts
          if (!/^[a-zA-Z0-9_$-]+$/.test(module) || !/^[a-zA-Z0-9_$]+$/.test(name)) {
            return new Response('Invalid module or function name', { status: 400 })
          }

          try {
            const args = await req.text()
            const result = await callFunction(module, name, args)
            return new Response(result, { headers: { 'Content-Type': 'application/json' } })
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            return new Response(message, { status: 500 })
          }
        }

        return new Response('Not found', { status: 404 })
      }
    })
    baseUrl = `http://localhost:${server.port}`
  })

  afterAll(() => {
    server.stop()
  })

  test('POST returns function result', async () => {
    const res = await fetch(`${baseUrl}/_mei/fn/with-server/getWeather`, {
      method: 'POST',
      body: stringify(['NYC'])
    })

    expect(res.status).toBe(200)
    const result = parse(await res.text())
    expect(result).toEqual({ city: 'NYC', temp: 72 })
  })

  test('returns 400 for invalid module name', async () => {
    const res = await fetch(`${baseUrl}/_mei/fn/bad%20name/foo`, {
      method: 'POST',
      body: stringify([])
    })

    expect(res.status).toBe(400)
  })

  test('returns 500 for unknown module', async () => {
    const res = await fetch(`${baseUrl}/_mei/fn/nope/foo`, {
      method: 'POST',
      body: stringify([])
    })

    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).toContain('not found')
  })

  test('GET returns 404 (only POST)', async () => {
    const res = await fetch(`${baseUrl}/_mei/fn/with-server/getWeather`)

    expect(res.status).toBe(404)
  })
})
