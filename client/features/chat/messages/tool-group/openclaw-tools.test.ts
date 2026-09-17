// Tool cards for OpenClaw runs, per runtime.
//
// One OpenClaw agent can be served by different runtimes, and they do not share
// a tool vocabulary. The built-in loop calls its shell `exec`/`bash`; the codex
// runtime calls it `bash` and edits through `apply_patch`; a `claude-cli`-backed
// agent reports Claude Code's own names and argument keys. All three arrive as
// `provider: 'openclaw'`, so a card that only knows the built-in names renders
// the tool name with a blank line under it.
//
// Argument shapes below are verbatim from a live 2026.7.1 gateway.
import { describe, expect, test } from 'bun:test'

import type { ToolCall } from '@/lib/format'

import { formatInputBrief, getToolDisplayName } from './format'

function call(name: string, input: unknown): ToolCall {
  return { toolCallId: 't1', name, caller: 'model', provider: 'openclaw', state: 'success', input }
}

describe('the codex runtime', () => {
  test('names the file an apply_patch touches', () => {
    // Captured shape: codex describes an edit structurally, with no patch text.
    const c = call('apply_patch', {
      changes: [
        { path: '/root/.openclaw/workspace/notes.txt', kind: { type: 'update', move_path: null } }
      ]
    })
    expect(getToolDisplayName(c)).toBe('Edit')
    expect(formatInputBrief(c, '/root/.openclaw/workspace')).toBe('notes.txt')
  })

  test('counts the files when one patch touches several', () => {
    const c = call('apply_patch', {
      changes: [
        { path: 'a.ts', kind: { type: 'update' } },
        { path: 'b.ts', kind: { type: 'add' } }
      ]
    })
    expect(formatInputBrief(c, null)).toBe('2 files')
  })

  test('still reads the older raw-patch shape', () => {
    const c = call('apply_patch', { patch: '*** Update File: src/app.ts\n@@\n-a\n+b\n' })
    expect(formatInputBrief(c, null)).toBe('*** Update File: src/app.ts')
  })

  test('shows the command for its shell tool, without the login-shell wrapper', () => {
    const c = call('bash', {
      command: '/bin/bash -lc "sed -n \'1,120p\' notes.txt"',
      cwd: '/root/.openclaw/workspace'
    })
    expect(getToolDisplayName(c)).toBe('Bash')
    expect(formatInputBrief(c, null)).toBe("$ sed -n '1,120p' notes.txt")
  })
})

describe('a claude-cli-backed agent', () => {
  // Claude Code's vocabulary: capitalized names, `file_path` rather than `path`.
  test('labels and describes file tools', () => {
    for (const name of ['Read', 'Write', 'Edit']) {
      const c = call(name, { file_path: '/repo/server/api.ts' })
      expect(getToolDisplayName(c)).toBe(name)
      expect(formatInputBrief(c, '/repo')).toBe('server/api.ts')
    }
  })

  test('shows the command for Bash', () => {
    const c = call('Bash', { command: 'bun test' })
    expect(formatInputBrief(c, null)).toBe('$ bun test')
  })

  test('describes search tools', () => {
    expect(formatInputBrief(call('Glob', { pattern: '**/*.tsx' }), null)).toBe('**/*.tsx')
    expect(formatInputBrief(call('WebFetch', { url: 'https://example.com' }), null)).toBe(
      'https://example.com'
    )
  })

  test('an unknown tool still renders its name, without inventing a brief', () => {
    const c = call('SomeFutureTool', { whatever: 1 })
    expect(getToolDisplayName(c)).toBe('SomeFutureTool')
    expect(formatInputBrief(c, null)).toBe('')
  })
})

describe('the built-in runtime is unaffected', () => {
  test('exec still shows its command', () => {
    expect(formatInputBrief(call('exec', { command: 'echo hi' }), null)).toBe('$ echo hi')
  })

  test('read still uses the OpenClaw `path` key', () => {
    const c = call('read', { path: '/repo/notes.txt' })
    expect(getToolDisplayName(c)).toBe('Read file')
    expect(formatInputBrief(c, '/repo')).toBe('notes.txt')
  })
})
