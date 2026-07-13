import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test'

type QueryCall = {
  options: {
    cwd: string
    settingSources: string[]
  }
}

const queryCalls: QueryCall[] = []

mock.module('@anthropic-ai/claude-agent-sdk', () => ({
  query: (call: QueryCall) => {
    queryCalls.push(call)
    return {
      mcpServerStatus: async () => [],
      close: async () => {}
    }
  }
}))

const { getMcpStatus, getUserMcpStatus } = await import('./mcp')

let logSpy: ReturnType<typeof spyOn>

beforeEach(() => {
  queryCalls.length = 0
  logSpy = spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  logSpy.mockRestore()
})

test('project MCP status probes only project-scoped settings', async () => {
  await getMcpStatus('/tmp/moi-project-scope-test', 'project')

  expect(queryCalls).toHaveLength(1)
  expect(queryCalls[0]?.options.cwd).toBe('/tmp/moi-project-scope-test')
  expect(queryCalls[0]?.options.settingSources).toEqual(['project'])
})

test('user MCP status probes only user-scoped settings', async () => {
  await getUserMcpStatus()

  expect(queryCalls).toHaveLength(1)
  expect(queryCalls[0]?.options.cwd).toBe(process.cwd())
  expect(queryCalls[0]?.options.settingSources).toEqual(['user'])
})
