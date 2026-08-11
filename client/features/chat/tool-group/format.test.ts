import { describe, expect, test } from 'bun:test'

import type { ToolCall } from '@/lib/types'

import { formatDuration, formatInputBrief, getToolDisplayName } from './format'

// Hermes titles come pre-rendered by its ACP adapter (build_tool_title) in
// three shapes: "action: detail", "action (qualifier)", and
// "action (qualifier): detail".
function hermesCall(title: string): ToolCall {
  return {
    toolCallId: 'tc-1',
    name: title,
    caller: 'model',
    provider: 'hermes',
    state: 'success',
    input: {}
  }
}

describe('hermes tool titles', () => {
  test('maps known actions to labels with the detail as brief', () => {
    const cases: Array<[string, string, string]> = [
      [
        'web search: Nous Research official website',
        'Web search',
        'Nous Research official website'
      ],
      ['extract: https://example.com', 'Fetch webpage', 'https://example.com'],
      ['session search: personality OR tools', 'Search sessions', 'personality OR tools'],
      ['read: .moi/package.json', 'Read', '.moi/package.json'],
      ['process wait: proc_99ba08aee82b', 'Wait for process', 'proc_99ba08aee82b'],
      [
        'python: from hermes_tools import read_file',
        'Run Python',
        'from hermes_tools import read_file'
      ]
    ]
    for (const [title, label, brief] of cases) {
      expect(getToolDisplayName(hermesCall(title))).toBe(label)
      expect(formatInputBrief(hermesCall(title), null)).toBe(brief)
    }
  })

  test('prefixes terminal commands with $', () => {
    const call = hermesCall("terminal: printf 'demo: OK'; uname -s")
    expect(getToolDisplayName(call)).toBe('Run command')
    expect(formatInputBrief(call, null)).toBe("$ printf 'demo: OK'; uname -s")
  })

  test('surfaces the parenthesized qualifier as the brief when there is no detail', () => {
    const todo = hermesCall('todo (4 items)')
    expect(getToolDisplayName(todo)).toBe('Update TODO')
    expect(formatInputBrief(todo, null)).toBe('4 items')

    const skill = hermesCall('skill view (moi-workspace)')
    expect(getToolDisplayName(skill)).toBe('View skill')
    expect(formatInputBrief(skill, null)).toBe('moi-workspace')
  })

  test('drops the mode qualifier when a colon detail is present', () => {
    const patch = hermesCall('patch (replace): .moi/tool-demo.txt')
    expect(getToolDisplayName(patch)).toBe('Edit')
    expect(formatInputBrief(patch, null)).toBe('.moi/tool-demo.txt')
  })

  test('sentence-cases unmapped actions', () => {
    expect(getToolDisplayName(hermesCall('skills list'))).toBe('List skills')
    expect(getToolDisplayName(hermesCall('browser snapshot'))).toBe('Browser snapshot')
    expect(getToolDisplayName(hermesCall('send_message'))).toBe('Send message')
    expect(getToolDisplayName(hermesCall('skill create: my-skill'))).toBe('Skill create')
  })
})

describe('formatDuration', () => {
  test('rounds sub-second durations up to a whole second', () => {
    expect(formatDuration(850)).toBe('1s')
    expect(formatDuration(514)).toBe('1s')
    // Never "0s": anything the backend bothered to report is at least a second.
    expect(formatDuration(12)).toBe('1s')
  })

  test('rounds seconds to an integer', () => {
    expect(formatDuration(3_200)).toBe('3s')
    expect(formatDuration(3_600)).toBe('4s')
  })

  test('carries rounded seconds into minutes', () => {
    expect(formatDuration(59_600)).toBe('1m')
    expect(formatDuration(65_400)).toBe('1m 5s')
  })
})
