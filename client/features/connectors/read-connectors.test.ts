import { expect, test } from 'bun:test'
import { readConnectors } from './read-connectors'
import type { McpServer } from '@/lib/types'

test('delivers partial rows before completion and handles split frames', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const response = new Response(
    new ReadableStream({
      start(c) {
        controller = c
      }
    })
  )
  const updates: McpServer[][] = []
  const seen = Promise.withResolvers<void>()
  const result = readConnectors(response, rows => {
    updates.push(rows)
    seen.resolve()
  })
  const partial: McpServer[] = [{ name: 'Drive', status: 'connected' }]
  const bytes = new TextEncoder().encode(JSON.stringify({ connectors: partial }) + '\n')
  controller.enqueue(bytes.slice(0, 10))
  controller.enqueue(bytes.slice(10))
  await seen.promise
  expect(updates).toEqual([partial])
  const final = [...partial, { name: 'Mail', status: 'disabled' as const }]
  controller.enqueue(
    new TextEncoder().encode(JSON.stringify({ connectors: final, done: true }) + '\n')
  )
  expect(await result).toEqual(final)
})

test('does not treat an incomplete or failed stream as a complete list', async () => {
  await expect(readConnectors(new Response('{"connectors":[]}\n'), () => {})).rejects.toThrow(
    'before completion'
  )
  await expect(readConnectors(new Response('{"error":"offline"}\n'), () => {})).rejects.toThrow(
    'offline'
  )
})
