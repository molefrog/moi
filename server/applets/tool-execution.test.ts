import { expect, test } from 'bun:test'

import { prepareTool } from './tool-execution'
import { isJsonValue } from '@/lib/tools'

test('validates metadata and schemas before publishing tools', () => {
  const tool = {
    name: 'read',
    description: 'Read data',
    inputSchema: { type: 'object' },
    execute: () => null
  }
  expect(prepareTool(tool).descriptor).toEqual({
    name: 'read',
    description: 'Read data',
    inputSchema: { type: 'object' }
  })
  for (const change of [
    { name: '../read' },
    { description: '' },
    { inputSchema: { type: 'invalid' } },
    { annotations: { readOnlyHint: 'yes' } }
  ])
    expect(() => prepareTool({ ...tool, ...change })).toThrow()
})

test('rejects lossy JSON values while accepting reused non-cyclic objects', () => {
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  for (const value of [
    undefined,
    NaN,
    Infinity,
    new Date(),
    new Map(),
    cyclic,
    Array(2),
    { value: undefined }
  ])
    expect(isJsonValue(value)).toBe(false)
  const shared = { value: 1 }
  expect(isJsonValue([shared, shared])).toBe(true)
})

test('validation cannot mutate data through a handler before rejecting arguments', async () => {
  let calls = 0
  const tool = prepareTool({
    name: 'increment',
    description: 'Increment a counter',
    inputSchema: {
      type: 'object',
      properties: { by: { type: 'integer', minimum: 1 } },
      required: ['by'],
      additionalProperties: false
    },
    execute: () => {
      calls++
      return { calls }
    }
  })
  const signal = new AbortController().signal
  await expect(tool.call({ by: 0 }, signal)).rejects.toThrow('Invalid tool arguments')
  expect(calls).toBe(0)
  expect(await tool.call({ by: 1 }, signal)).toEqual({ calls: 1 })
})
