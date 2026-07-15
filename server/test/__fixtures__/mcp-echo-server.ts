// Minimal stdio MCP server used by mcp-broker tests. Spawned as a child by
// StdioClientTransport (command: bun, args: [this file]).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'echo-fixture', version: '1.0.0' })

server.registerTool(
  'echo',
  { description: 'Echo back the input text', inputSchema: { text: z.string() } },
  async ({ text }) => ({ content: [{ type: 'text', text: `echo:${text}` }] })
)

server.registerTool('boom', { description: 'Always fails' }, async () => ({
  isError: true,
  content: [{ type: 'text' as const, text: 'kaboom' }]
}))

await server.connect(new StdioServerTransport())
