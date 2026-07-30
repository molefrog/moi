import { describe, expect, test } from 'bun:test'

import { generateClaudeChatTitle, parseClaudeTitleOutput } from './title'

describe('parseClaudeTitleOutput', () => {
  test('reads and sanitizes structured output', () => {
    expect(parseClaudeTitleOutput({ title: '**Fix picker focus.**' })).toBe('Fix picker focus')
  })

  test('rejects malformed output', () => {
    expect(parseClaudeTitleOutput('Fix picker focus')).toBeUndefined()
    expect(parseClaudeTitleOutput({ title: 42 })).toBeUndefined()
  })
})

describe('generateClaudeChatTitle', () => {
  test('uses a non-persistent tool-free query', async () => {
    let closed = false
    let received:
      | {
          prompt: string
          options: {
            persistSession?: boolean
            maxTurns?: number
            tools?: string[] | { type: 'preset'; preset: 'claude_code' }
            settingSources?: string[]
            effort?: string
            pathToClaudeCodeExecutable?: string
          }
        }
      | undefined

    const title = await generateClaudeChatTitle({
      workspacePath: '/workspace',
      source: 'The effort picker loses focus after opening',
      executable: '/claude',
      queryFactory: input => {
        received = input
        return {
          async *[Symbol.asyncIterator]() {
            yield {
              type: 'result',
              subtype: 'success',
              structured_output: { title: 'Fix picker focus' }
            }
          },
          close() {
            closed = true
          }
        }
      }
    })

    expect(title).toBe('Fix picker focus')
    expect(received?.prompt).toContain(
      '<message>The effort picker loses focus after opening</message>'
    )
    expect(received?.options).toMatchObject({
      persistSession: false,
      maxTurns: 1,
      tools: [],
      settingSources: [],
      effort: 'low',
      pathToClaudeCodeExecutable: '/claude'
    })
    expect(closed).toBe(true)
  })

  test('returns no title and closes the query when generation times out', async () => {
    let closed = false
    const title = await generateClaudeChatTitle({
      workspacePath: '/workspace',
      source: 'The effort picker loses focus',
      executable: '/claude',
      timeoutMs: 1,
      queryFactory: () => ({
        [Symbol.asyncIterator]() {
          return {
            next: () => new Promise(() => {})
          }
        },
        close() {
          closed = true
        }
      })
    })

    expect(title).toBeUndefined()
    expect(closed).toBe(true)
  })
})
