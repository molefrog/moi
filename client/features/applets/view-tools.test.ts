import { expect, test } from 'bun:test'

import {
  callViewTool,
  registerViewTool,
  listViewTools,
  registerViewWebMcpTools
} from './view-tools'
import { isJsonValue } from '@/lib/tools'

const signal = () => new AbortController().signal
const report = () => {}
const tool = {
  name: 'set_filter',
  description: 'Set filter',
  inputSchema: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] },
  execute: async (args: Record<string, unknown>) => ({ status: String(args.status) })
}

test('validates inputs and returns handler results without native WebMCP', async () => {
  const dispose = registerViewTool('test', 'orders', tool)
  try {
    await expect(callViewTool('test', 'orders', tool.name, {}, signal())).rejects.toThrow(
      'Invalid tool arguments'
    )
    expect(
      await callViewTool('test', 'orders', tool.name, { status: 'overdue' }, signal())
    ).toEqual({ status: 'overdue' })
  } finally {
    dispose()
  }
  await expect(callViewTool('test', 'orders', tool.name, {}, signal())).rejects.toThrow(
    'unavailable'
  )
})

test('duplicate registration fails and stale cleanup cannot erase replacement', async () => {
  const old = registerViewTool('duplicate', 'orders', tool)
  expect(() => registerViewTool('duplicate', 'orders', tool)).toThrow('Duplicate')
  old()
  const next = registerViewTool('duplicate', 'orders', tool)
  old()
  expect(await callViewTool('duplicate', 'orders', tool.name, { status: 'all' }, signal())).toEqual(
    { status: 'all' }
  )
  next()
})

test('disposal cancels in-flight handlers even if they ignore the signal', async () => {
  const dispose = registerViewTool('cancel', 'orders', {
    ...tool,
    execute: () => new Promise(() => {})
  })
  const result = callViewTool('cancel', 'orders', tool.name, { status: 'all' }, signal())
  dispose()
  await expect(result).rejects.toThrow('cancelled')
})

test('handler errors and non-JSON results are returned as errors', async () => {
  const dispose = registerViewTool('error', 'orders', {
    ...tool,
    execute: async () => {
      throw new Error('failed to load')
    }
  })
  await expect(
    callViewTool('error', 'orders', tool.name, { status: 'all' }, signal())
  ).rejects.toThrow('failed to load')
  dispose()
  const invalid = registerViewTool('error', 'orders', { ...tool, execute: async () => NaN })
  await expect(
    callViewTool('error', 'orders', tool.name, { status: 'all' }, signal())
  ).rejects.toThrow('JSON-serializable')
  invalid()
})

test('accepts WebMCP names and rejects values that change during JSON transport', () => {
  const dotted = registerViewTool('json', 'orders', { ...tool, name: 'order.archive' })
  expect(listViewTools('json', 'orders')[0]?.name).toBe('order.archive')
  dotted()

  expect(() => registerViewTool('json', 'orders', { ...tool, name: 'x'.repeat(129) })).toThrow(
    'valid name'
  )

  const sparse: unknown[] & { extra?: string } = new Array(2)
  sparse[1] = 'kept'
  sparse.extra = 'dropped'
  expect(isJsonValue(sparse)).toBe(false)
})

test('native registration exposes only the selected view and shares its handler', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const native: { tool?: typeof tool; signal?: AbortSignal } = {}
  let registered: () => void = () => {}
  const ready = new Promise<void>(resolve => {
    registered = resolve
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      modelContext: {
        registerTool(value: typeof tool, options: { signal: AbortSignal }) {
          native.tool = value
          native.signal = options.signal
          registered()
        }
      }
    }
  })
  let disposeTool = () => {}
  let disposeWebMcp = () => {}
  try {
    disposeTool = registerViewTool('native', 'orders', tool)
    const hidden = registerViewTool('native', 'hidden', { ...tool, name: 'hidden_tool' })
    disposeWebMcp = registerViewWebMcpTools('native', 'orders', report)
    await ready
    expect(native.tool?.name).toBe(tool.name)
    expect(await native.tool?.execute({ status: 'overdue' })).toEqual({ status: 'overdue' })
    await expect(native.tool!.execute({})).rejects.toThrow('Invalid tool arguments')
    disposeWebMcp()
    expect(native.signal?.aborted).toBe(true)
    hidden()
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        modelContext: {
          registerTool() {
            throw new Error('unsupported')
          }
        }
      }
    })
    const errors: string[] = []
    let reported: () => void = () => {}
    const failed = new Promise<void>(resolve => {
      reported = resolve
    })
    disposeWebMcp = registerViewWebMcpTools('native', 'orders', error => {
      errors.push(error)
      reported()
    })
    await failed
    expect(errors[0]).toContain('WebMCP registration failed')
    expect(await callViewTool('native', 'orders', tool.name, { status: 'all' }, signal())).toEqual({
      status: 'all'
    })
  } finally {
    disposeWebMcp()
    disposeTool()
    if (previous) Object.defineProperty(globalThis, 'document', previous)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
