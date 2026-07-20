import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

type QueryCall = {
  options: {
    cwd: string
    settingSources: string[]
    pathToClaudeCodeExecutable: string
    mcpServers?: Record<string, unknown>
    strictMcpConfig?: boolean
  }
}

const queryCalls: QueryCall[] = []
const agentSdk = await import('@anthropic-ai/claude-agent-sdk')
let closeError: Error | null = null

mock.module('@anthropic-ai/claude-agent-sdk', () => ({
  // Module mocks are process-wide in Bun. Preserve the real SDK exports so
  // tests loaded after this file can still import session helpers.
  ...agentSdk,
  query: (call: QueryCall) => {
    queryCalls.push(call)
    return {
      mcpServerStatus: async () => [],
      close: () => {
        if (closeError) throw closeError
      }
    }
  }
}))

const { getMcpStatus, getUserMcpStatus } = await import('./mcp')

let logSpy: ReturnType<typeof spyOn>
let whichSpy: ReturnType<typeof spyOn>

beforeEach(() => {
  queryCalls.length = 0
  closeError = null
  logSpy = spyOn(console, 'log').mockImplementation(() => {})
  whichSpy = spyOn(Bun, 'which').mockImplementation(command =>
    command === 'claude' ? '/test/bin/claude' : null
  )
})

afterEach(() => {
  logSpy.mockRestore()
  whichSpy.mockRestore()
})

test('SDK mock preserves unrelated session exports', async () => {
  const sdk = await import('@anthropic-ai/claude-agent-sdk')

  expect(sdk.getSessionMessages).toBe(agentSdk.getSessionMessages)
  expect(sdk.listSessions).toBe(agentSdk.listSessions)
})

async function withProjectMcp<T>(body: Record<string, unknown>, fn: (dir: string) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), 'moi-mcp-'))
  try {
    const file = join(dir, '.mcp.json')
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(body, null, 2))
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('project MCP status is empty when the workspace has no project config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moi-mcp-empty-'))
  try {
    const status = await getMcpStatus(dir, 'project')

    expect(status).toEqual([])
    expect(queryCalls).toHaveLength(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('project MCP status probes only explicit project .mcp.json servers', async () => {
  await withProjectMcp(
    {
      mcpServers: {
        local: {
          command: 'bun',
          args: ['server.ts']
        }
      }
    },
    async dir => {
      await getMcpStatus(dir, 'project')

      expect(queryCalls).toHaveLength(1)
      expect(queryCalls[0]?.options.cwd).toBe(dir)
      expect(queryCalls[0]?.options.settingSources).toEqual(['project'])
      expect(queryCalls[0]?.options.pathToClaudeCodeExecutable).toBe('/test/bin/claude')
      expect(queryCalls[0]?.options.mcpServers).toEqual({
        local: {
          command: 'bun',
          args: ['server.ts']
        }
      })
      expect(queryCalls[0]?.options.strictMcpConfig).toBe(true)
    }
  )
})

test('user MCP status probes only user-scoped settings', async () => {
  await getUserMcpStatus()

  expect(queryCalls).toHaveLength(1)
  expect(queryCalls[0]?.options.cwd).toBe(process.cwd())
  expect(queryCalls[0]?.options.settingSources).toEqual(['user'])
  expect(queryCalls[0]?.options.pathToClaudeCodeExecutable).toBe('/test/bin/claude')
})

test('settled MCP status survives an SDK cleanup error', async () => {
  closeError = new Error('Query closed before response received')

  await withProjectMcp(
    {
      mcpServers: {
        local: {
          command: 'bun',
          args: ['server.ts']
        }
      }
    },
    async dir => {
      expect(await getMcpStatus(dir, 'project')).toEqual([])
    }
  )
})
