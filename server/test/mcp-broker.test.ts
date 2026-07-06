import type { McpServerStatus } from '@anthropic-ai/claude-agent-sdk'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { parse, stringify } from 'devalue'
import { join } from 'node:path'

import { callFunction, restartWorker } from '../functions'
import {
  callMcpTool,
  closeAllMcpClients,
  listMcpServers,
  listMcpTools,
  setMcpStatusProviderForTest
} from '../mcp-broker'

const FIXTURES = join(import.meta.dir, '__fixtures__')

// Override the MEI_FUNCTIONS_DIR so the worker loads from test fixtures
process.env.MEI_FUNCTIONS_DIR = FIXTURES

// Synthetic probe result standing in for getMcpStatus (which needs the real
// `claude` CLI). The `echo` entry points at the stdio fixture server; the
// others cover the not-callable branches.
const STATUS: McpServerStatus[] = [
  {
    name: 'echo',
    status: 'connected',
    scope: 'project',
    config: {
      type: 'stdio',
      command: process.execPath,
      args: [join(FIXTURES, 'mcp-echo-server.ts')]
    },
    tools: [{ name: 'echo' }, { name: 'boom' }]
  },
  {
    name: 'gated',
    status: 'needs-auth',
    config: { type: 'http', url: 'https://mcp.example.com/mcp' }
  },
  {
    name: 'connector',
    status: 'connected',
    config: { type: 'claudeai-proxy', url: 'https://claude.ai/mcp', id: 'cn_123' }
  }
]

beforeAll(() => {
  setMcpStatusProviderForTest(async () => STATUS)
})

afterAll(() => {
  closeAllMcpClients()
  setMcpStatusProviderForTest(null)
  restartWorker(FIXTURES)
})

describe('mcp-broker (direct)', () => {
  test('calls a tool on a stdio server', async () => {
    const result = await callMcpTool(FIXTURES, 'echo', 'echo', { text: 'hi' })
    expect(result.content[0]?.text).toBe('echo:hi')
  })

  test('reuses the pooled connection across calls', async () => {
    const a = await callMcpTool(FIXTURES, 'echo', 'echo', { text: 'a' })
    const b = await callMcpTool(FIXTURES, 'echo', 'echo', { text: 'b' })
    expect(a.content[0]?.text).toBe('echo:a')
    expect(b.content[0]?.text).toBe('echo:b')
  })

  test('surfaces isError results as thrown errors', async () => {
    await expect(callMcpTool(FIXTURES, 'echo', 'boom')).rejects.toThrow('kaboom')
  })

  test('rejects unknown servers, listing configured names', async () => {
    await expect(callMcpTool(FIXTURES, 'nope', 'echo')).rejects.toThrow('Unknown MCP server "nope"')
  })

  test('rejects needs-auth servers with an OAuth hint', async () => {
    await expect(callMcpTool(FIXTURES, 'gated', 'anything')).rejects.toThrow('claude mcp login')
  })

  test('rejects claude.ai connectors', async () => {
    await expect(callMcpTool(FIXTURES, 'connector', 'anything')).rejects.toThrow(
      'claude.ai connector'
    )
  })

  test('lists tools from a live connection', async () => {
    const tools = await listMcpTools(FIXTURES, 'echo')
    expect(tools.map(t => t.name).sort()).toEqual(['boom', 'echo'])
  })

  test('lists servers with callability flags without dialing', async () => {
    const servers = await listMcpServers(FIXTURES)
    const byName = Object.fromEntries(servers.map(s => [s.name, s]))
    expect(byName.echo.callable).toBe(true)
    expect(byName.echo.tools).toEqual(['echo', 'boom'])
    expect(byName.gated.callable).toBe(false)
    expect(byName.gated.reason).toContain('OAuth')
    expect(byName.connector.callable).toBe(false)
  })
})

describe('mcp via server functions (worker IPC round-trip)', () => {
  test('a .server.ts calls an MCP tool through `import { mcp } from "moi"`', async () => {
    const result = parse(
      await callFunction('mcp-probe', 'echoViaMcp', stringify(['hey']), FIXTURES)
    )
    expect(result).toBe('echo:hey')
  })

  test('listServers reaches the worker', async () => {
    const names = parse(
      await callFunction('mcp-probe', 'listServerNames', stringify([]), FIXTURES)
    ) as string[]
    expect(names.sort()).toEqual(['connector', 'echo', 'gated'])
  })

  test('broker errors propagate to the caller', async () => {
    await expect(
      callFunction('mcp-probe', 'callUnknownServer', stringify([]), FIXTURES)
    ).rejects.toThrow('Unknown MCP server')
  })
})
