import { expect, spyOn, test } from 'bun:test'
import * as sdk from '@anthropic-ai/claude-agent-sdk'
import type { Query } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import * as executable from '../executable'
import { canReadTool, runClaudeAction } from './run-action'

async function expectToolPermission(
  hook: sdk.HookCallback,
  toolName: string,
  decision: 'allow' | 'deny',
  mcpServer?: string
) {
  const result = await hook(
    {
      hook_event_name: 'PreToolUse',
      session_id: 'test-session',
      transcript_path: '/tmp/test-transcript',
      cwd: '/tmp',
      tool_use_id: 'test-tool-use',
      tool_name: toolName,
      ...(mcpServer ? { mcp_server: { name: mcpServer, source: 'claudeai' } } : {}),
      tool_input: { progress: { count: 2 } }
    },
    'test-tool-use',
    { signal: new AbortController().signal }
  )
  expect(result).toMatchObject({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision }
  })
}

test('discovery refuses writes, shell commands, and unannotated connector tools', () => {
  expect(canReadTool('Read')).toBe(true)
  expect(canReadTool('Bash')).toBe(false)
  expect(canReadTool('Write')).toBe(false)
  expect(canReadTool('mcp__test__search')).toBe(false)
  expect(canReadTool('mcp__test__search', { readOnly: true })).toBe(true)
  expect(canReadTool('mcp__test__delete', { readOnly: true, destructive: true })).toBe(false)
})

for (const enabled of [false, true]) {
  test(`Claude reporting permissions with progress ${enabled ? 'enabled' : 'disabled'}`, async () => {
    let closed = false
    const executableSpy = spyOn(executable, 'requireHarnessExecutable').mockReturnValue(
      '/fake/claude'
    )
    const querySpy = spyOn(sdk, 'query').mockImplementation(({ options }) => {
      expect(options?.mcpServers?.moi_action?.type).toBe(enabled ? 'http' : undefined)
      expect(options?.outputFormat).toMatchObject({
        schema: { $schema: 'http://json-schema.org/draft-07/schema#' }
      })
      // Only the Query methods consumed by the action are needed here.
      return {
        close: () => {
          closed = true
        },
        mcpServerStatus: async () => [
          {
            name: 'claude.ai Granola',
            status: 'connected',
            tools: [
              { name: 'search', annotations: { readOnly: true } },
              { name: 'nested__read', annotations: { readOnly: true } },
              { name: 'delete', annotations: { readOnly: true, destructive: true } },
              { name: 'unknown' }
            ]
          }
        ],
        async *[Symbol.asyncIterator]() {
          const hook = options?.hooks?.PreToolUse?.[0]?.hooks[0]
          expect(hook).toBeDefined()
          for (const [tool, decision] of [
            ['search', 'allow'],
            ['nested__read', 'allow'],
            ['delete', 'deny'],
            ['unknown', 'deny']
          ] as const) {
            await expectToolPermission(
              hook!,
              `mcp__claude_ai_Granola__${tool}`,
              decision,
              'claude.ai Granola'
            )
          }
          await expectToolPermission(hook!, 'mcp__claude_ai_Granola__search', 'deny')
          await expectToolPermission(
            hook!,
            'mcp__claude_ai_Granola__search',
            'deny',
            'another server'
          )
          await expectToolPermission(
            hook!,
            'mcp__moi_action__report_progress',
            enabled ? 'allow' : 'deny'
          )
          for (const name of [
            'mcp__other_server__report_progress',
            'mcp__moi_action__other_tool',
            'Write'
          ])
            await expectToolPermission(hook!, name, 'deny')
          yield {
            type: 'result',
            subtype: 'success',
            is_error: !enabled,
            result: 'Not logged in',
            structured_output: enabled ? { done: true } : undefined
          }
        }
      } as unknown as Query
    })
    try {
      const input = {
        prompt: 'Work',
        resultSchema: z.object({ done: z.boolean() }),
        signal: new AbortController().signal
      }
      const result = runClaudeAction(
        enabled
          ? { ...input, progressSchema: z.object({ count: z.number() }), onProgress: () => {} }
          : input
      )
      if (enabled) expect(await result).toEqual({ done: true })
      else await expect(result).rejects.toThrow('Not logged in')
      expect(closed).toBe(true)
    } finally {
      querySpy.mockRestore()
      executableSpy.mockRestore()
    }
  })
}

test.each([
  ['fast', 'haiku', 'high'],
  ['normal', 'sonnet', 'medium'],
  ['smart', 'sonnet', 'xhigh'],
  [undefined, 'sonnet', 'medium']
] as const)('action model %s uses %s with %s effort', async (model, expectedModel, effort) => {
  const executableSpy = spyOn(executable, 'requireHarnessExecutable').mockReturnValue(
    '/fake/claude'
  )
  const querySpy = spyOn(sdk, 'query').mockImplementation(({ options }) => {
    expect(options?.model).toBe(expectedModel)
    expect(options?.effort).toBe(effort)
    return {
      close() {},
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          subtype: 'success',
          is_error: false,
          structured_output: { done: true }
        }
      }
    } as unknown as Query
  })
  try {
    expect(
      await runClaudeAction({
        prompt: 'Work',
        model,
        resultSchema: z.object({ done: z.boolean() }),
        signal: new AbortController().signal
      })
    ).toEqual({ done: true })
  } finally {
    querySpy.mockRestore()
    executableSpy.mockRestore()
  }
})
