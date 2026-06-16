import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { parse, stringify } from 'devalue'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'

import { callFunction, parseFunctionPath, restartWorker } from '../functions'
import {
  setSecretStoreBackend,
  setWorkspaceEnvStorePath,
  updateWorkspaceEnv
} from '../workspace-env'

const FIXTURES = join(import.meta.dir, '__fixtures__')

// Override the MEI_FUNCTIONS_DIR so the worker loads from test fixtures
process.env.MEI_FUNCTIONS_DIR = FIXTURES

describe('callFunction (via worker)', () => {
  test('calls a function and returns result', async () => {
    const result = parse(
      await callFunction('with-server', 'getWeather', stringify(['NYC']), FIXTURES)
    )

    expect(result).toEqual({ city: 'NYC', temp: 72 })
  })

  test('rejects on unknown module', async () => {
    await expect(callFunction('nope', 'foo', stringify([]), FIXTURES)).rejects.toThrow('not found')
  })

  test('rejects on unknown function', async () => {
    await expect(
      callFunction('with-server', 'nonexistent', stringify([]), FIXTURES)
    ).rejects.toThrow('not a function')
  })

  test('rejects on function error', async () => {
    await expect(callFunction('error', 'failHard', stringify([]), FIXTURES)).rejects.toThrow(
      'intentional test error'
    )
  })

  test('handles devalue types round-trip', async () => {
    const result = parse(await callFunction('types', 'getDate', stringify([]), FIXTURES))
    expect(result).toBeInstanceOf(Date)
  })

  test('calls a module keyed by a nested path', async () => {
    const result = parse(await callFunction('nested/deep', 'getDeep', stringify([]), FIXTURES))
    expect(result).toEqual({ source: 'deep' })
  })
})

describe('parseFunctionPath', () => {
  test('parses a flat module', () => {
    expect(parseFunctionPath('weather/getWeather')).toEqual({
      module: 'weather',
      name: 'getWeather'
    })
  })

  test('parses a nested module on the last slash', () => {
    expect(parseFunctionPath('widgets/cat/getWeather')).toEqual({
      module: 'widgets/cat',
      name: 'getWeather'
    })
  })

  test('allows $ _ - in module segments and $ _ in names', () => {
    expect(parseFunctionPath('widgets/my-widget/get$Data')).toEqual({
      module: 'widgets/my-widget',
      name: 'get$Data'
    })
  })

  test('rejects traversal and malformed paths', () => {
    expect(parseFunctionPath('../etc/passwd')).toBeNull()
    expect(parseFunctionPath('widgets/../secret/fn')).toBeNull()
    expect(parseFunctionPath('widgets/./hello/fn')).toBeNull()
    expect(parseFunctionPath('/widgets/hello/fn')).toBeNull()
    expect(parseFunctionPath('widgets/hello/')).toBeNull()
    expect(parseFunctionPath('widgets//hello/fn')).toBeNull()
    expect(parseFunctionPath('noslash')).toBeNull()
    expect(parseFunctionPath('widgets/hello/not a fn')).toBeNull()
    expect(parseFunctionPath('bad name/fn')).toBeNull()
  })
})

describe('/_rpc/fn endpoint', () => {
  let server: ReturnType<typeof Bun.serve>
  let baseUrl: string

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const path = new URL(req.url).pathname

        if (req.method === 'POST' && path.startsWith('/_rpc/fn/')) {
          const parsed = parseFunctionPath(path.replace('/_rpc/fn/', ''))
          if (!parsed) {
            return new Response('Invalid module or function name', { status: 400 })
          }

          const { module, name } = parsed
          try {
            const args = await req.text()
            const result = await callFunction(module, name, args, FIXTURES)
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
    const res = await fetch(`${baseUrl}/_rpc/fn/with-server/getWeather`, {
      method: 'POST',
      body: stringify(['NYC'])
    })

    expect(res.status).toBe(200)
    const result = parse(await res.text())
    expect(result).toEqual({ city: 'NYC', temp: 72 })
  })

  test('returns 400 for invalid module name', async () => {
    const res = await fetch(`${baseUrl}/_rpc/fn/bad%20name/foo`, {
      method: 'POST',
      body: stringify([])
    })

    expect(res.status).toBe(400)
  })

  test('returns 500 for unknown module', async () => {
    const res = await fetch(`${baseUrl}/_rpc/fn/nope/foo`, {
      method: 'POST',
      body: stringify([])
    })

    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).toContain('not found')
  })

  test('GET returns 404 (only POST)', async () => {
    const res = await fetch(`${baseUrl}/_rpc/fn/with-server/getWeather`)

    expect(res.status).toBe(404)
  })
})

describe('worker env isolation', () => {
  let storeDir: string

  beforeAll(async () => {
    // Pin the file secret backend so the workspace-env store never hits the
    // real OS keychain, and point it at a throwaway dir.
    storeDir = await mkdtemp(join(tmpdir(), 'moi-fn-env-'))
    setWorkspaceEnvStorePath(
      join(storeDir, 'workspace-env.json'),
      join(storeDir, 'workspace-secrets.json')
    )
    setSecretStoreBackend('file')
    // A workspace .env that should ONLY reach the worker via moi's injection,
    // never via Bun's auto-load-from-cwd.
    await writeFile(join(FIXTURES, '.env'), 'MOI_LEAK_SENTINEL=leaked\n')
  })

  afterAll(async () => {
    await rm(join(FIXTURES, '.env'), { force: true })
    await rm(storeDir, { recursive: true, force: true })
    setSecretStoreBackend('auto')
    restartWorker(FIXTURES)
  })

  test('chdir restores cwd = workspace root after neutral spawn', async () => {
    const cwd = parse(await callFunction('cwd', 'getCwd', stringify([]), FIXTURES)) as string
    expect(basename(cwd)).toBe('__fixtures__')
  })

  test('workspace .env does NOT auto-load when inheritDotenv is off', async () => {
    await updateWorkspaceEnv(FIXTURES, { inheritDotenv: false })
    restartWorker(FIXTURES)
    const v = parse(await callFunction('envprobe', 'readSentinel', stringify([]), FIXTURES))
    expect(v).toBeNull()
  })

  test('moi injection still delivers .env when inheritDotenv is on', async () => {
    await updateWorkspaceEnv(FIXTURES, { inheritDotenv: true })
    restartWorker(FIXTURES)
    const v = parse(await callFunction('envprobe', 'readSentinel', stringify([]), FIXTURES))
    expect(v).toBe('leaked')
  })
})
