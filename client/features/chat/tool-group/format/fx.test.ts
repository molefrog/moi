import { describe, expect, test } from 'bun:test'

import type { ToolCall } from '@/lib/types'

import { formatInputBrief, getToolDisplayName } from './index'

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
})
