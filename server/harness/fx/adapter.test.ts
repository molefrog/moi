import { describe, expect, test } from 'bun:test'

import type { Turn } from '@/lib/format'

import { toolContentToText, type ToolCallUpdate } from '../acp/wire'
import {
  describeFxOperationalMessage,
  isFxOperationalMessage,
  normalizeFxToolUpdate
} from './adapter'

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
    expect(normalized.rawOutput).toEqual({ preview, state: 'completed' })
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

function settled(output: string, state: 'success' | 'error' = 'success'): Turn {
  return {
    id: 't',
    role: 'assistant',
    origin: { kind: 'user-input' },
    timestamp: '',
    parts: [
      {
        type: 'tool-call',
        call: {
          toolCallId: 'c',
          name: 'shell',
          caller: 'model',
          state,
          input: { action: 'run', command: 'sleep 60' },
          output
        }
      }
    ]
  }
}

describe('fx backgrounded commands', () => {
  const running =
    '{"session_id":"shell-1","state":"running","backend":"captured","persistence":"process","output_truncated":false,"output_incomplete":false,"output_terminal_safe":true,"full_output_handle":null,"exit_co'

  test('a yielded run reports that it moved to the background', () => {
    const normalized = normalizeFxToolUpdate(update(running, 'completed'), previous('shell', ''))
    expect(toolContentToText(normalized.content)).toBe('Moved to the background as shell-1.')
    expect(normalized.rawOutput).toMatchObject({ state: 'running', session_id: 'shell-1' })
  })

  test('late output replaces the status line instead of extending it', () => {
    const normalized = normalizeFxToolUpdate(
      update('late\n'),
      settled('Moved to the background as shell-1.')
    )
    expect(toolContentToText(normalized.content)).toBe('late\n')
  })

  test('late output keeps the settled outcome of the invocation', () => {
    expect(normalizeFxToolUpdate(update('late\n'), settled('')).status).toBe('completed')
    expect(normalizeFxToolUpdate(update('late\n'), settled('', 'error')).status).toBe('failed')
    expect(normalizeFxToolUpdate(update('more\n'), previous()).status).toBe('in_progress')
  })

  test('placeholders from older rows are never used as output', () => {
    const normalized = normalizeFxToolUpdate(
      update('late\n'),
      settled('fx did not include command output in this history preview.')
    )
    expect(toolContentToText(normalized.content)).toBe('late\n')
  })

  test('waiting on a backgrounded command reports how it ended', () => {
    const normalized = normalizeFxToolUpdate(
      {
        toolCallId: 'c',
        status: 'completed',
        content: [
          {
            type: 'content',
            content: {
              type: 'text',
              text: '{"session_id":"shell-1","state":"completed","backend":"captured","persistence":"process","output_truncated":false,"output_incomplete":false,"output_terminal_safe":true,"full_output_handle":"fx-command'
            }
          }
        ],
        command_result: { kind: 'command', exit_code: 0, stdout_bytes: 33, stderr_bytes: 0 }
      } as ToolCallUpdate,
      {
        ...previous('shell', ''),
        parts: [
          {
            type: 'tool-call',
            call: {
              toolCallId: 'c',
              name: 'shell',
              caller: 'model',
              state: 'running',
              input: { action: 'interact', session_id: 'shell-1' }
            }
          }
        ]
      }
    )
    expect(toolContentToText(normalized.content)).toBe('shell-1 finished with exit code 0.')
  })
})

describe('fx operational messages', () => {
  test('recognizes provider failures and the restart marker', () => {
    expect(isFxOperationalMessage('HTTP 502: upstream unavailable')).toBe(true)
    expect(isFxOperationalMessage('HTTP 429')).toBe(true)
    expect(isFxOperationalMessage('AI_GATEWAY_API_KEY authentication failed · HTTP 401')).toBe(true)
    expect(isFxOperationalMessage('\n\n[Response interrupted. Restarting.]\n\n')).toBe(true)
    expect(isFxOperationalMessage('HTTP 404 means the page was not found.\nTry again.')).toBe(false)
  })

  test('treats interrupted outcomes as notices only during history replay', () => {
    expect(isFxOperationalMessage('cancelled', { replaying: true })).toBe(true)
    expect(isFxOperationalMessage('failed', { replaying: true })).toBe(true)
    expect(isFxOperationalMessage('cancelled', { replaying: false })).toBe(false)
  })

  test('describes notices in product language', () => {
    expect(describeFxOperationalMessage('cancelled')).toBe(
      'This run was stopped before it finished.'
    )
    expect(describeFxOperationalMessage('HTTP 502: bad gateway')).toBe(
      'The model request failed: HTTP 502: bad gateway'
    )
    expect(describeFxOperationalMessage('[context] omitted rules')).toBe('[context] omitted rules')
  })
})

describe('fx tool failures', () => {
  function failed(text: string): ToolCallUpdate {
    return update(text, 'failed')
  }

  test('shows the message of a held action with the reviewer advice', () => {
    const envelope =
      '{"error":{"type":"tool_review_held","tool_name":"shell","message":"Action held after safety review","reason":"review_caution","held":true,"advice":"Do not delete the home directory"}}'
    const normalized = normalizeFxToolUpdate(failed(envelope), previous('shell', ''))
    expect(toolContentToText(normalized.content)).toBe(
      'Action held after safety review.\n\nReviewer advice: Do not delete the home directory'
    )
    expect(normalized.rawOutput).toEqual(JSON.parse(envelope))
  })

  test('describes cancelled and coded failures', () => {
    expect(
      toolContentToText(
        normalizeFxToolUpdate(
          failed('{"error":{"tool":"shell","code":"Cancelled","retryable":false}}'),
          previous('shell', '')
        ).content
      )
    ).toBe('Stopped before it finished.')
    expect(
      toolContentToText(
        normalizeFxToolUpdate(
          failed('{"error":{"tool":"read_file","code":"FileNotFound"}}'),
          previous('read_file', '')
        ).content
      )
    ).toBe('File not found.')
  })

  test('leaves ordinary failure text alone', () => {
    expect(
      toolContentToText(
        normalizeFxToolUpdate(failed('no such file'), previous('read_file')).content
      )
    ).toBe('no such file')
  })
})
