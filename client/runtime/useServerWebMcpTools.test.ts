import { afterEach, expect, spyOn, test } from 'bun:test'

import type { Tool } from '@/lib/tools'

import { registerServerWebMcpTools } from './useServerWebMcpTools'

const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')

afterEach(() => {
  if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
  else Reflect.deleteProperty(globalThis, 'document')
})

test('registers one target catalog through WebMCP and calls its encoded HTTP route', async () => {
  const registrations: { tool: Tool; signal: AbortSignal }[] = []
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      modelContext: {
        registerTool(tool: Tool, options: { signal: AbortSignal }) {
          registrations.push({ tool, signal: options.signal })
        }
      }
    }
  })
  const requests: { url: string; init?: RequestInit }[] = []
  const fakeFetch: typeof fetch = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input)
      requests.push({ url, init })
      if (!init?.method)
        return Response.json([
          {
            name: 'read_canvas',
            description: 'Read the canvas',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false }
          }
        ])
      return Response.json({ shapes: [] })
    },
    { preconnect: fetch.preconnect }
  )
  const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(fakeFetch)
  try {
    const controller = new AbortController()
    const dispose = await registerServerWebMcpTools(
      'workspace id',
      'scratchpad',
      controller.signal,
      () => {}
    )
    expect(requests[0]?.url).toBe('/api/workspaces/workspace%20id/tools/scratchpad')
    expect(registrations.map(({ tool }) => tool.name)).toEqual(['read_canvas'])
    expect(await registrations[0]!.tool.execute({})).toEqual({ shapes: [] })
    expect(requests[1]).toMatchObject({
      url: '/api/workspaces/workspace%20id/tools/scratchpad/read_canvas',
      init: { method: 'POST', body: '{}' }
    })
    dispose()
    expect(registrations[0]!.signal.aborted).toBe(true)
  } finally {
    fetchMock.mockRestore()
  }
})
