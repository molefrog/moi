import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { parse, stringify } from 'devalue'
import { join } from 'path'

const FIXTURES = join(import.meta.dir, '__fixtures__')
const WORKER_PATH = join(import.meta.dir, '..', 'functions-worker.ts')

type ResultMsg = { id: string; type: 'result'; data: string }
type ErrorMsg = { id: string; type: 'error'; message: string }
type ReadyMsg = { type: 'ready' }
type WorkerMsg = ResultMsg | ErrorMsg | ReadyMsg

function spawnTestWorker() {
  let readyResolve: () => void
  const readyPromise = new Promise<void>(r => (readyResolve = r))
  const pending = new Map<string, { resolve: (msg: WorkerMsg) => void }>()

  const proc = Bun.spawn([process.execPath, WORKER_PATH], {
    env: { ...process.env, MEI_FUNCTIONS_DIR: FIXTURES },
    stderr: 'inherit',
    ipc(message) {
      const msg = message as WorkerMsg
      if (msg.type === 'ready') {
        readyResolve()
        return
      }
      if ('id' in msg) {
        pending.get(msg.id)?.resolve(msg)
        pending.delete(msg.id)
      }
    }
  })

  return {
    ready: readyPromise,

    async call(module: string, name: string, args: unknown[] = []): Promise<WorkerMsg> {
      await readyPromise
      const id = crypto.randomUUID()
      return new Promise(resolve => {
        pending.set(id, { resolve })
        proc.send({ id, type: 'call', module, name, args: stringify(args) })
      })
    },

    async reload(modules: string[]) {
      await readyPromise
      proc.send({ type: 'reload', modules })
      // Give the worker time to process
      await new Promise(r => setTimeout(r, 50))
    },

    kill() {
      proc.kill()
    }
  }
}

describe('functions-worker', () => {
  let worker: ReturnType<typeof spawnTestWorker>

  beforeAll(async () => {
    worker = spawnTestWorker()
    await worker.ready
  })

  afterAll(() => {
    worker.kill()
  })

  test('calls a basic server function', async () => {
    const msg = await worker.call('with-server', 'getWeather', ['NYC'])

    expect(msg.type).toBe('result')
    const result = parse((msg as ResultMsg).data)
    expect(result).toEqual({ city: 'NYC', temp: 72 })
  })

  test('calls function with multiple args', async () => {
    const msg = await worker.call('with-server', 'getForecast', ['NYC', 5])

    expect(msg.type).toBe('result')
    const result = parse((msg as ResultMsg).data)
    expect(result).toEqual({ city: 'NYC', days: 5, forecast: [] })
  })

  test('returns error for unknown module', async () => {
    const msg = await worker.call('nonexistent', 'foo')

    expect(msg.type).toBe('error')
    expect((msg as ErrorMsg).message).toContain('not found')
  })

  test('loads a module keyed by a nested path', async () => {
    const msg = await worker.call('nested/deep', 'getDeep')

    expect(msg.type).toBe('result')
    expect(parse((msg as ResultMsg).data)).toEqual({ source: 'deep' })
  })

  test('refuses module keys that resolve outside MEI_FUNCTIONS_DIR', async () => {
    // ../outside.server.ts exists (server/test/outside.server.ts) but sits
    // outside the fixtures root — the containment guard must reject it.
    const msg = await worker.call('../outside', 'leak')

    expect(msg.type).toBe('error')
    expect((msg as ErrorMsg).message).toContain('not found')
  })

  test('returns error for unknown function', async () => {
    const msg = await worker.call('with-server', 'nonexistentFn')

    expect(msg.type).toBe('error')
    expect((msg as ErrorMsg).message).toContain('not a function')
  })

  test('returns error when function throws', async () => {
    const msg = await worker.call('error', 'failHard')

    expect(msg.type).toBe('error')
    expect((msg as ErrorMsg).message).toContain('intentional test error')
  })

  test('reloads module and resets state', async () => {
    const msg1 = await worker.call('stateful', 'increment')
    expect(parse((msg1 as ResultMsg).data)).toBe(1)

    const msg2 = await worker.call('stateful', 'increment')
    expect(parse((msg2 as ResultMsg).data)).toBe(2)

    await worker.reload(['stateful'])

    const msg3 = await worker.call('stateful', 'increment')
    // After reload + dispose(), counter resets. Fresh import starts at 0, so increment returns 1
    expect(parse((msg3 as ResultMsg).data)).toBe(1)
  })

  test('handles Date round-trip via devalue', async () => {
    const msg = await worker.call('types', 'getDate')

    expect(msg.type).toBe('result')
    const result = parse((msg as ResultMsg).data)
    expect(result).toBeInstanceOf(Date)
    expect((result as Date).getFullYear()).toBe(2025)
  })

  test('handles Map round-trip via devalue', async () => {
    const msg = await worker.call('types', 'getMap')

    expect(msg.type).toBe('result')
    const result = parse((msg as ResultMsg).data)
    expect(result).toBeInstanceOf(Map)
    expect((result as Map<string, number>).get('a')).toBe(1)
  })

  test('handles Set round-trip via devalue', async () => {
    const msg = await worker.call('types', 'getSet')

    expect(msg.type).toBe('result')
    const result = parse((msg as ResultMsg).data)
    expect(result).toBeInstanceOf(Set)
    expect((result as Set<number>).has(3)).toBe(true)
  })

  test('echoes complex args through devalue', async () => {
    const input = { date: new Date('2025-06-15'), items: new Set(['x', 'y']) }
    const msg = await worker.call('types', 'echo', [input])

    expect(msg.type).toBe('result')
    const result = parse((msg as ResultMsg).data) as typeof input
    expect(result.date).toBeInstanceOf(Date)
    expect(result.items).toBeInstanceOf(Set)
    expect(result.items.has('x')).toBe(true)
  })
})
