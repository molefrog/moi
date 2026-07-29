import { describe, expect, test } from 'bun:test'

import type { CodexModel } from './adapter'
import { defaultCodexTitleEffort, generateCodexChatTitle, parseCodexTitleOutput } from './title'

type Listener = (method: string, params: Record<string, unknown>) => void

function model(input: Partial<CodexModel> = {}): CodexModel {
  return {
    id: 'default',
    model: 'default',
    displayName: 'Default',
    ...input
  }
}

describe('defaultCodexTitleEffort', () => {
  test('uses the first supported effort from the default model', () => {
    expect(
      defaultCodexTitleEffort([
        model({
          isDefault: true,
          supportedReasoningEfforts: [{ reasoningEffort: 'minimal' }, { reasoningEffort: 'low' }]
        })
      ])
    ).toBe('minimal')
  })

  test('omits effort when the default model reports none', () => {
    expect(defaultCodexTitleEffort([model({ isDefault: true })])).toBeUndefined()
  })
})

describe('parseCodexTitleOutput', () => {
  test('reads and sanitizes structured output', () => {
    expect(parseCodexTitleOutput('{"title":"**Fix picker focus.**"}')).toBe('Fix picker focus')
  })

  test('rejects malformed output', () => {
    expect(parseCodexTitleOutput('Fix picker focus')).toBeUndefined()
    expect(parseCodexTitleOutput('{"title":42}')).toBeUndefined()
  })
})

describe('generateCodexChatTitle', () => {
  test('uses an ephemeral default-model thread with the lowest effort', async () => {
    const calls: { method: string; params: Record<string, unknown> }[] = []
    let listener: Listener | undefined
    const client = {
      onNotification(next: Listener) {
        listener = next
        return () => {
          listener = undefined
        }
      },
      async rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
        calls.push({ method, params })
        if (method === 'thread/start') return { thread: { id: 'title-thread' } } as T
        if (method === 'turn/start') {
          queueMicrotask(() => {
            listener?.('item/completed', {
              threadId: 'title-thread',
              item: { type: 'agentMessage', id: 'item-1', text: '{"title":"Fix picker focus"}' }
            })
            listener?.('turn/completed', {
              threadId: 'title-thread',
              turn: { id: 'title-turn', items: [], status: 'completed' }
            })
          })
          return { turn: { id: 'title-turn', items: [], status: 'inProgress' } } as T
        }
        return {} as T
      }
    }

    const title = await generateCodexChatTitle({
      client,
      workspacePath: '/workspace',
      source: 'The effort picker loses focus',
      models: [
        model({
          isDefault: true,
          supportedReasoningEfforts: [{ reasoningEffort: 'minimal' }, { reasoningEffort: 'low' }]
        })
      ]
    })

    expect(title).toBe('Fix picker focus')
    expect(calls[0]).toEqual({
      method: 'thread/start',
      params: {
        cwd: '/workspace',
        sandbox: 'danger-full-access',
        approvalPolicy: 'never',
        ephemeral: true
      }
    })
    expect(calls[1]?.params).toMatchObject({
      threadId: 'title-thread',
      effort: 'minimal',
      outputSchema: {
        type: 'object',
        required: ['title'],
        additionalProperties: false
      }
    })
    expect(calls[1]?.params).not.toHaveProperty('model')
    expect(calls.at(-1)).toEqual({
      method: 'thread/unsubscribe',
      params: { threadId: 'title-thread' }
    })
  })

  test('returns no title and cleans up when generation times out', async () => {
    const calls: string[] = []
    const client = {
      onNotification() {
        return () => {}
      },
      async rpc<T>(method: string): Promise<T> {
        calls.push(method)
        if (method === 'thread/start') return { thread: { id: 'title-thread' } } as T
        if (method === 'turn/start') {
          return { turn: { id: 'title-turn', items: [], status: 'inProgress' } } as T
        }
        return {} as T
      }
    }

    const title = await generateCodexChatTitle({
      client,
      workspacePath: '/workspace',
      source: 'The effort picker loses focus',
      models: [],
      timeoutMs: 1
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(title).toBeUndefined()
    expect(calls).toContain('turn/interrupt')
    expect(calls).toContain('thread/unsubscribe')
  })
})
