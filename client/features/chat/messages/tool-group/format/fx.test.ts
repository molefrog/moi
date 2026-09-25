import { describe, expect, test } from 'bun:test'

import type { ToolCall } from '@/lib/types'

import { formatInputBrief, formatResultSummary, getToolDisplayName } from './index'

function call(name: string, input: unknown): ToolCall {
  return { toolCallId: 'fx-call', name, input, caller: 'model', provider: 'fx', state: 'success' }
}

describe('fx tool rows', () => {
  test('shows shell commands from direct and wrapped inputs', () => {
    const input = { command: '/bin/sh -lc "cat /repo/note.txt"' }
    for (const args of [input, { request: input }]) {
      const shell = call('shell', args)
      expect(getToolDisplayName(shell)).toBe('Run command')
      expect(formatInputBrief(shell, '/repo')).toBe('$ cat note.txt')
    }
  })

  test.each([
    ['read_file', 'Read'],
    ['file_read', 'Read'],
    ['write_file', 'Write'],
    ['file_write', 'Write'],
    ['edit_file', 'Edit']
  ])('shows paths for %s', (name, label) => {
    const file = call(name, { request: { path: '/repo/src/file.ts' } })
    expect(getToolDisplayName(file)).toBe(label)
    expect(formatInputBrief(file, '/repo')).toBe('src/file.ts')
  })

  test('keeps unknown tools readable and tolerates missing inputs', () => {
    expect(getToolDisplayName(call('custom_tool', {}))).toBe('Custom tool')
    expect(formatInputBrief(call('shell', null), null)).toBe('')
    expect(formatInputBrief(call('read_file', { request: [] }), null)).toBe('')
  })

  test('labels shell actions on yielded commands', () => {
    const wait = call('shell', { request: { action: 'interact', session_id: 'shell-1' } })
    expect(getToolDisplayName(wait)).toBe('Wait for command')
    expect(formatInputBrief(wait, null)).toBe('shell-1')
    const stop = call('shell', { action: 'stop', session_id: 'shell-2' })
    expect(getToolDisplayName(stop)).toBe('Stop command')
    expect(formatInputBrief(stop, null)).toBe('shell-2')
  })

  test.each([
    [
      'skill',
      { location: '/repo/.agents/skills/moi-workspace/SKILL.md' },
      'Read skill',
      'moi-workspace'
    ],
    [
      'skill',
      { location: '/repo/.agents/skills/pdf', resource: 'forms.md' },
      'Read skill',
      'pdf · forms.md'
    ],
    ['web_fetch', { url: 'https://example.com' }, 'Fetch webpage', 'https://example.com'],
    ['capability_search', { query: 'send email' }, 'Search capabilities', 'send email'],
    ['glob_files', { pattern: 'src/**/*.ts' }, 'Find files', 'src/**/*.ts'],
    ['grep_files', { pattern: 'TODO' }, 'Search files', 'TODO'],
    [
      'subagent',
      { request: { action: 'run', task: 'Count files\nthen report' } },
      'Run subagent',
      'Count files'
    ],
    [
      'subagent',
      { request: { action: 'message', agent: 'scout', message: 'Stop' } },
      'Message subagent',
      'scout · Stop'
    ]
  ])('describes %s rows', (name, input, label, detail) => {
    const row = call(name, input)
    expect(getToolDisplayName(row)).toBe(label)
    expect(formatInputBrief(row, '/repo')).toBe(detail)
  })

  test.each([
    [
      { command_result: { exit_code: 0, signal: null, duration_ms: 5156 } },
      undefined,
      'Exit code 0 · 5.2 s'
    ],
    [
      { command_result: { exit_code: null, signal: 15, duration_ms: 9279 } },
      undefined,
      'Stopped after 9.3 s'
    ],
    [
      { command_result: { exit_code: null, signal: 9, timed_out: true, duration_ms: 120000 } },
      undefined,
      'Timed out after 120 s'
    ],
    [undefined, { exitCode: 2, signal: null }, 'Exit code 2']
  ])('summarizes how a command ended', (rawOutput, fxShell, summary) => {
    const row = {
      ...call('shell', { request: { action: 'run', command: 'ls' } }),
      sidecar: { ...(rawOutput ? { rawOutput } : {}), ...(fxShell ? { fxShell } : {}) }
    }
    expect(formatResultSummary(row)).toBe(summary)
  })

  test('omits the summary while a command runs and for other tools', () => {
    const running = {
      ...call('shell', { command: 'sleep 9' }),
      state: 'running' as const,
      sidecar: { rawOutput: { command_result: { exit_code: 0 } } }
    }
    expect(formatResultSummary(running)).toBeUndefined()
    expect(formatResultSummary(call('read_file', { path: 'a' }))).toBeUndefined()
  })
})
