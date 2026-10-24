import type { ServerTool } from 'moi'
let saved = 0
export async function saveOrder(id: string) {
  saved++
  return { id, saved, source: 'server-only-tool-implementation' }
}
export async function getSaved() { return saved }
export const tools = {
  save_order: {
    description: 'Save one order',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    execute: ({ id }) => saveOrder(id)
  } satisfies ServerTool<{ id: string }>,
  read_saved: {
    description: 'Read saved count', inputSchema: { type: 'object' },
    annotations: { readOnlyHint: true }, execute: async () => ({ saved })
  },
  fail: {
    description: 'Fail on purpose', inputSchema: { type: 'object' },
    execute: async () => { throw new Error('backend failed') }
  },
  rich_result: {
    description: 'Invalid JSON result', inputSchema: { type: 'object' },
    execute: async () => new Date()
  },
  slow: {
    description: 'Wait for cancellation', inputSchema: { type: 'object' },
    execute: async (_args: unknown, { signal }: { signal: AbortSignal }) => {
      await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
      return null
    }
  }
}
