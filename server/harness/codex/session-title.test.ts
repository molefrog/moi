import { describe, expect, test } from 'bun:test'

import {
  codexSessionTitleCommand,
  parseCodexFeatureNames,
  renameCodexSessionIfUnchanged
} from './session-title'

test('parses Codex feature-list rows defensively', () => {
  expect(
    parseCodexFeatureNames(`shell_tool       stable              true
multi_agent      stable              false
bad/name         experimental        true
`)
  ).toEqual(['shell_tool', 'multi_agent'])
})

test('Codex session-title command is ephemeral and disables every advertised feature', () => {
  const command = codexSessionTitleCommand({
    executable: '/bin/codex',
    cwd: '/tmp/title',
    schemaPath: '/tmp/title/schema.json',
    outputPath: '/tmp/title/result.json',
    features: ['shell_tool', 'apps']
  })
  expect(command.slice(0, 2)).toEqual(['/bin/codex', 'exec'])
  expect(command.at(-1)).toBe('-')
  for (const flag of [
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '--strict-config',
    '--skip-git-repo-check'
  ]) {
    expect(command).toContain(flag)
  }
  expect(command.slice(command.indexOf('--sandbox'), command.indexOf('--sandbox') + 2)).toEqual([
    '--sandbox',
    'read-only'
  ])
  expect(command.filter(value => value === '--disable')).toHaveLength(2)
  expect(command).toContain('shell_tool')
  expect(command).toContain('apps')
  expect(command).toContain('web_search="disabled"')
  expect(command).toContain('tools.experimental_request_user_input.enabled=false')
  expect(command).toContain('include_environment_context=false')
  expect(command).toContain('project_doc_max_bytes=0')
  expect(command).toContain('skills.include_instructions=false')
  expect(command).toContain('orchestrator.mcp.enabled=false')
  expect(command.some(value => value.startsWith('developer_instructions='))).toBe(true)
})

type FakeCodexClient = Parameters<typeof renameCodexSessionIfUnchanged>[0]['client']

function renameClient(name: string | null = null) {
  const calls: { method: string; params?: Record<string, unknown> }[] = []
  const client: FakeCodexClient = {
    async rpc<T>(method: string, params?: Record<string, unknown>): Promise<T> {
      calls.push({ method, params })
      return (method === 'thread/read' ? { thread: { id: 'thread-1', name } } : {}) as T
    }
  }
  return { client, calls }
}

describe('renameCodexSessionIfUnchanged', () => {
  test('sets a name only while the thread remains unnamed and current', async () => {
    const fake = renameClient()
    expect(
      await renameCodexSessionIfUnchanged({
        client: fake.client,
        threadId: 'thread-1',
        title: 'Review authentication flow',
        isCurrent: () => true
      })
    ).toBe(true)
    expect(fake.calls.at(-1)).toEqual({
      method: 'thread/name/set',
      params: { threadId: 'thread-1', name: 'Review authentication flow' }
    })
  })

  test('preserves an existing name or replaced session', async () => {
    for (const [name, isCurrent] of [
      ['Manual title', true],
      [null, false]
    ] as const) {
      const fake = renameClient(name)
      expect(
        await renameCodexSessionIfUnchanged({
          client: fake.client,
          threadId: 'thread-1',
          title: 'Generated title',
          isCurrent: () => isCurrent
        })
      ).toBe(false)
      expect(fake.calls.some(call => call.method === 'thread/name/set')).toBe(false)
    }
  })
})
