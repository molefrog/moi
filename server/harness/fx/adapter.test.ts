import { describe, expect, test } from 'bun:test'

import type { Turn } from '@/lib/format'

import { toolContentToText, type ToolCallUpdate } from '../acp/wire'
import { isFxOperationalMessage, normalizeFxToolUpdate } from './adapter'

function previous(name = 'shell', output = 'first\n'): Turn {
  return {
    id: 't',
    role: 'assistant',
    origin: { kind: 'user-input' },
    timestamp: '',
    parts: [
      {
        type: 'tool-call',
        call: { toolCallId: 'c', name, caller: 'model', state: 'running', input: {}, output }
      }
    ]
  }
}

function update(text: string, status: ToolCallUpdate['status'] = 'in_progress'): ToolCallUpdate {
  return {
    toolCallId: 'c',
    status,
    content: [{ type: 'content', content: { type: 'text', text } }]
  }
}

describe('fx tool updates', () => {
  test('accumulates only shell deltas', () => {
    expect(toolContentToText(normalizeFxToolUpdate(update('second\n'), previous()).content)).toBe(
      'first\nsecond\n'
    )
    expect(
      toolContentToText(normalizeFxToolUpdate(update('second\n'), previous('web_search')).content)
    ).toBe('second\n')
  })

  test('keeps shell output when completion carries an execution envelope', () => {
    const normalized = normalizeFxToolUpdate(
      {
        ...update('{"state":"completed","exit_code":0}', 'completed'),
        command_result: { kind: 'command', exit_code: 0 }
      } as ToolCallUpdate,
      previous()
    )
    expect(toolContentToText(normalized.content)).toBe('first\n')
    expect(normalized.rawOutput).toEqual({
      state: 'completed',
      exit_code: 0,
      command_result: { kind: 'command', exit_code: 0 }
    })
  })

  test('keeps useful final text and failure text as replacements', () => {
    expect(
      toolContentToText(
        normalizeFxToolUpdate(update('permission denied', 'failed'), previous()).content
      )
    ).toBe('permission denied')
    expect(
      toolContentToText(
        normalizeFxToolUpdate(update('wrote file', 'completed'), previous('write_file')).content
      )
    ).toBe('wrote file')
  })

  test('recognizes the real truncated execution envelope without erasing stdout', () => {
    const preview =
      '{"session_id":null,"state":"completed","backend":"captured","persistence":"process","output_truncated":false,"output_incomplete":false,"output_terminal_safe":true,"full_output_handle":"fx-command-repl'
    const normalized = normalizeFxToolUpdate(update(preview, 'completed'), previous())
    expect(toolContentToText(normalized.content)).toBe('first\n')
    expect(normalized.rawOutput).toEqual({ preview })
    const replay = normalizeFxToolUpdate(update(preview, 'completed'), previous('shell', ''))
    expect(toolContentToText(replay.content)).toBe(
      'fx did not include command output in this history preview.'
    )
  })

  test('preserves explicit empty output', () => {
    expect(normalizeFxToolUpdate({ toolCallId: 'c', content: [] }, previous()).content).toEqual([])
  })

  test('uses tool identity and unwraps file inputs', () => {
    const normalized = normalizeFxToolUpdate({
      toolCallId: 'c',
      name: 'read_file',
      title: 'Reading',
      rawInput: { request: { path: '/tmp/example' } }
    } as ToolCallUpdate)
    expect(normalized).toMatchObject({
      title: 'read_file',
      rawInput: { path: '/tmp/example' },
      locations: [{ path: '/tmp/example' }]
    })
  })

  test('classifies operational messages after their prefix has accumulated', () => {
    expect(isFxOperationalMessage('[context] instructions were omitted')).toBe(true)
    expect(isFxOperationalMessage('skill discovery warning: unavailable')).toBe(true)
    expect(isFxOperationalMessage('Here is the context:')).toBe(false)
  })
})
