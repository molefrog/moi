import { describe, expect, test } from 'bun:test'

import type { CodexThread, CodexThreadItem } from './adapter'
import {
  codexItemToNotice,
  codexItemToTurn,
  codexModelToModel,
  codexThreadToEvents,
  codexThreadToSessionInfo
} from './adapter'

const THREAD = 'thread-1'

describe('codexItemToTurn', () => {
  test('userMessage uses clientId as turn id when present', () => {
    const item: CodexThreadItem = {
      type: 'userMessage',
      id: 'item-1',
      clientId: 'optimistic-42',
      content: [{ type: 'text', text: 'hello' }]
    }
    const turn = codexItemToTurn(item, THREAD)!
    expect(turn.id).toBe('optimistic-42')
    expect(turn.role).toBe('user')
    expect(turn.parts).toEqual([{ type: 'text', text: 'hello' }])
  })

  test('userMessage falls back to a thread-scoped id without clientId', () => {
    const item: CodexThreadItem = {
      type: 'userMessage',
      id: 'item-1',
      clientId: null,
      content: [{ type: 'text', text: 'hello' }]
    }
    expect(codexItemToTurn(item, THREAD)!.id).toBe('codex:thread-1:item-1')
  })

  test('agentMessage becomes an assistant text turn with apiMessageId meta', () => {
    const item: CodexThreadItem = { type: 'agentMessage', id: 'msg_1', text: 'hi there' }
    const turn = codexItemToTurn(item, THREAD)!
    expect(turn.role).toBe('assistant')
    expect(turn.parts).toEqual([{ type: 'text', text: 'hi there' }])
    expect(turn.meta?.apiMessageId).toBe('msg_1')
  })

  test('empty agentMessage (item/started) is dropped', () => {
    expect(codexItemToTurn({ type: 'agentMessage', id: 'msg_1', text: '' }, THREAD)).toBeNull()
  })

  test('reasoning joins summary sections into one reasoning part', () => {
    const item: CodexThreadItem = { type: 'reasoning', id: 'r1', summary: ['a', 'b'] }
    const turn = codexItemToTurn(item, THREAD)!
    expect(turn.parts).toEqual([{ type: 'reasoning', text: 'a\n\nb' }])
  })

  test('commandExecution maps status/output onto a codex exec tool call', () => {
    const running: CodexThreadItem = {
      type: 'commandExecution',
      id: 'exec-1',
      command: 'ls',
      cwd: '/tmp',
      status: 'inProgress'
    }
    const call = codexItemToTurn(running, THREAD)!.parts[0]
    expect(call).toMatchObject({
      type: 'tool-call',
      call: { name: 'exec', provider: 'codex', state: 'running', input: { command: 'ls' } }
    })

    const done: CodexThreadItem = {
      ...running,
      status: 'completed',
      aggregatedOutput: 'file.txt\n',
      exitCode: 0,
      durationMs: 12
    }
    const doneCall = codexItemToTurn(done, THREAD)!.parts[0]
    expect(doneCall).toMatchObject({
      call: { state: 'success', output: 'file.txt\n', sidecar: { exitCode: 0 } }
    })

    const failed: CodexThreadItem = {
      ...running,
      status: 'failed',
      aggregatedOutput: 'boom',
      exitCode: 1
    }
    expect(codexItemToTurn(failed, THREAD)!.parts[0]).toMatchObject({
      call: { state: 'error', errorText: 'boom' }
    })
  })

  test('fileChange carries structured per-file changes', () => {
    const item: CodexThreadItem = {
      type: 'fileChange',
      id: 'fc-1',
      status: 'completed',
      changes: [{ path: '/w/a.ts', kind: { type: 'add' }, diff: '+x\n' }]
    }
    expect(codexItemToTurn(item, THREAD)!.parts[0]).toMatchObject({
      call: {
        name: 'apply_patch',
        state: 'success',
        input: { changes: [{ path: '/w/a.ts', kind: 'add', diff: '+x\n' }] }
      }
    })
  })

  test('mcpToolCall keeps server name and flattens text results', () => {
    const item: CodexThreadItem = {
      type: 'mcpToolCall',
      id: 'mcp-1',
      server: 'notion',
      tool: 'notion-search',
      status: 'completed',
      arguments: { query: 'x' },
      result: { content: [{ type: 'text', text: 'found it' }], structuredContent: null }
    }
    expect(codexItemToTurn(item, THREAD)!.parts[0]).toMatchObject({
      call: { name: 'notion-search', mcpServer: 'notion', state: 'success', output: 'found it' }
    })
  })

  test('collabAgentToolCall maps to a subagent tool card', () => {
    const item: CodexThreadItem = {
      type: 'collabAgentToolCall',
      id: 'call-1',
      tool: 'spawn',
      status: 'inProgress',
      prompt: 'count the files',
      receiverThreadIds: ['child-1']
    }
    expect(codexItemToTurn(item, THREAD)!.parts[0]).toMatchObject({
      call: {
        name: 'subagent',
        caller: 'subagent',
        state: 'running',
        input: { action: 'spawn', prompt: 'count the files', agents: ['child-1'] }
      }
    })
  })

  test('subAgentActivity maps to a subagent activity card', () => {
    const item: CodexThreadItem = {
      type: 'subAgentActivity',
      id: 'act-1',
      kind: 'started',
      agentThreadId: 'child-1',
      agentPath: '/root/count_files'
    }
    expect(codexItemToTurn(item, THREAD)!.parts[0]).toMatchObject({
      call: { name: 'subagent_activity', input: { kind: 'started' } }
    })
  })

  test('commandExecution passes commandActions through for semantic labels', () => {
    const item: CodexThreadItem = {
      type: 'commandExecution',
      id: 'exec-2',
      command: '/bin/zsh -lc "sed -n \'1p\' notes.md"',
      status: 'completed',
      commandActions: [
        { type: 'read', command: 'sed -n 1p notes.md', name: 'notes.md', path: '/w/notes.md' }
      ]
    }
    expect(codexItemToTurn(item, THREAD)!.parts[0]).toMatchObject({
      call: { name: 'exec', input: { commandActions: [{ type: 'read', name: 'notes.md' }] } }
    })
  })

  test('review mode transitions map to review cards', () => {
    const entered: CodexThreadItem = {
      type: 'enteredReviewMode',
      id: 'rv-1',
      text: 'check the diff'
    }
    expect(codexItemToTurn(entered, THREAD)!.parts[0]).toMatchObject({
      call: { name: 'review', input: { phase: 'entered', review: 'check the diff' } }
    })
    const exited: CodexThreadItem = { type: 'exitedReviewMode', id: 'rv-2' }
    expect(codexItemToTurn(exited, THREAD)!.parts[0]).toMatchObject({
      call: { name: 'review', input: { phase: 'exited' } }
    })
  })

  test('imageView maps to a view_image card', () => {
    const item = { type: 'imageView', id: 'iv-1', path: '/w/shot.png' } as CodexThreadItem
    expect(codexItemToTurn(item, THREAD)!.parts[0]).toMatchObject({
      call: { name: 'view_image', input: { path: '/w/shot.png' } }
    })
  })

  test('contextCompaction maps to a compact notice, not a turn', () => {
    const item: CodexThreadItem = { type: 'contextCompaction', id: 'cc-1' }
    expect(codexItemToTurn(item, THREAD)).toBeNull()
    expect(codexItemToNotice(item, THREAD)).toMatchObject({ kind: 'compact' })
  })

  test('unknown item kinds are dropped', () => {
    expect(codexItemToTurn({ type: 'sleep', id: 's1' }, THREAD)).toBeNull()
    expect(codexItemToNotice({ type: 'sleep', id: 's1' }, THREAD)).toBeNull()
  })
})

describe('codexThreadToEvents', () => {
  test('walks turns and items into stream events', () => {
    const thread: CodexThread = {
      id: THREAD,
      turns: [
        {
          id: 't1',
          status: 'completed',
          items: [
            {
              type: 'userMessage',
              id: 'i1',
              clientId: null,
              content: [{ type: 'text', text: 'q' }]
            },
            { type: 'agentMessage', id: 'i2', text: 'a' }
          ]
        }
      ]
    }
    const events = codexThreadToEvents(thread)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ kind: 'turn', turn: { role: 'user' } })
    expect(events[1]).toMatchObject({ kind: 'turn', turn: { role: 'assistant' } })
  })
})

describe('discovery mappings', () => {
  test('thread row → SessionInfo (seconds → millis)', () => {
    const info = codexThreadToSessionInfo({
      id: 'th-1',
      preview: 'Fix the bug',
      cwd: '/w',
      createdAt: 100,
      updatedAt: 200
    })
    expect(info).toEqual({
      sessionId: 'th-1',
      summary: 'Fix the bug',
      lastModified: 200_000,
      cwd: '/w'
    })
  })

  test('codex model → picker Model with effort levels', () => {
    const model = codexModelToModel({
      id: 'gpt-5.6-sol',
      model: 'gpt-5.6-sol',
      displayName: 'GPT-5.6-Sol',
      description: 'Latest frontier model.',
      supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }],
      defaultReasoningEffort: 'low'
    })
    expect(model).toEqual({
      value: 'gpt-5.6-sol',
      resolvedModel: 'gpt-5.6-sol',
      displayName: 'GPT-5.6-Sol',
      description: 'GPT-5.6-Sol · Latest frontier model.',
      supportsEffort: true,
      supportedEffortLevels: ['low', 'high']
    })
  })
})
