import { describe, expect, test } from 'bun:test'

import { CodexRpcError, createCodexTransport, type Json } from './transport'
import { CodexInputRequests } from './input-requests'

function fixture(timeoutMs = 100) {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const writes: Json[] = []
  let stops = 0
  const transport = createCodexTransport({
    stdout: new ReadableStream({
      start(value) {
        controller = value
      }
    }),
    write: line => {
      writes.push(JSON.parse(line))
    },
    stop: () => {
      stops++
    },
    timeoutMs
  })
  const raw = (text: string) => controller.enqueue(new TextEncoder().encode(text))
  return {
    transport,
    writes,
    raw,
    end: () => controller.close(),
    stops: () => stops,
    frame: (frame: Json) => raw(JSON.stringify(frame) + '\n')
  }
}

describe('Codex JSON-RPC transport', () => {
  test('a server-cleared input request produces no duplicate response on the wire', async () => {
    const f = fixture()
    const inputs = new CodexInputRequests(() => {})
    f.transport.onRequest((method, params, id) =>
      method === 'item/tool/requestUserInput' ? inputs.request(params, id) : undefined
    )
    f.transport.onNotification((method, params) => {
      if (method === 'serverRequest/resolved' && typeof params.requestId === 'string')
        inputs.resolved(params.requestId)
    })
    f.frame({
      id: 'question',
      method: 'item/tool/requestUserInput',
      params: { questions: [{ id: 'q', question: 'Choose' }] }
    })
    f.frame({ method: 'serverRequest/resolved', params: { requestId: 'question' } })
    await Bun.sleep(0)
    expect(inputs.hasPending).toBe(false)
    expect(f.writes).toEqual([])
    f.transport.close()
  })
  test('handles fragmented UTF-8, batched frames, invalid JSON and a final line without newline', async () => {
    const f = fixture()
    const seen: string[] = []
    f.transport.onNotification(method => seen.push(method))
    const first = f.transport.rpc<string>('one')
    const second = f.transport.rpc<string>('two')
    f.raw('null\n[]\nmalformed\n{"id":1,"res')
    f.raw('ult":"hello 🌍"}\n{"method":"event","params":{}}\n{"id":2,"result":"last"}')
    f.end()
    expect(await first).toBe('hello 🌍')
    expect(await second).toBe('last')
    await Bun.sleep(0)
    expect(seen).toEqual(['event', '__exit'])
    expect(f.stops()).toBe(1)
  })

  test('preserves RPC code and data for safe fallback decisions', async () => {
    const f = fixture()
    const result = f.transport.rpc('turn/steer').catch(error => error)
    f.frame({ id: 1, error: { code: -32600, message: 'No active turn', data: { turnId: 'a' } } })
    const error = await result
    expect(error).toBeInstanceOf(CodexRpcError)
    if (!(error instanceof CodexRpcError)) throw new Error('Expected a native RPC error')
    expect(error.code).toBe(-32600)
    expect(error.data).toEqual({ turnId: 'a' })
    f.transport.close()
  })

  test('times out once, ignores late replies, and remains usable', async () => {
    const f = fixture(5)
    await expect(f.transport.rpc('slow')).rejects.toThrow('timed out: slow')
    f.frame({ id: 1, result: 'late' })
    const next = f.transport.rpc('next')
    f.frame({ id: 2, result: 42 })
    expect(await next).toBe(42)
    f.transport.close()
  })

  test('rejects pending requests and announces exit exactly once', async () => {
    const f = fixture()
    let exits = 0
    f.transport.onNotification(method => {
      if (method === '__exit') exits++
    })
    const pending = f.transport.rpc('waiting')
    f.transport.close()
    f.transport.close()
    await expect(pending).rejects.toThrow('disconnected')
    await expect(f.transport.rpc('after-exit')).rejects.toThrow('not running')
    expect(exits).toBe(1)
    expect(f.stops()).toBe(1)
  })

  test('observes asynchronous write failures immediately', async () => {
    const transport = createCodexTransport({
      stdout: new ReadableStream(),
      write: async () => {
        throw new Error('broken pipe')
      },
      stop() {}
    })
    await expect(transport.rpc('initialize')).rejects.toThrow('broken pipe')
    expect(transport.isAlive()).toBe(false)
  })

  test('responds to string-id server requests and rejects unknown approval families', async () => {
    const f = fixture()
    f.frame({
      id: 'permission',
      method: 'item/permissions/requestApproval',
      params: {
        permissions: { network: { enabled: true }, fileSystem: null }
      }
    })
    f.frame({ id: 'unknown', method: 'unknown/requestApproval' })
    await Bun.sleep(0)
    expect(f.writes).toEqual([
      {
        jsonrpc: '2.0',
        id: 'permission',
        result: { permissions: { network: { enabled: true } }, scope: 'turn' }
      },
      {
        jsonrpc: '2.0',
        id: 'unknown',
        error: { code: -32601, message: 'moi does not handle unknown/requestApproval' }
      }
    ])
    f.transport.close()
  })
})
