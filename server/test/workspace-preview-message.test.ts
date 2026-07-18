import { describe, expect, test } from 'bun:test'

import {
  openClawSessionSetSignature,
  selectLatestOpenClawUpdatedAt,
  selectOldestOpenClawFirstUserMessage,
  type OpenClawSessionPreviewCandidate
} from '../harness/openclaw/discovery'
import {
  selectLatestSessionUpdatedAt,
  selectOldestSessionFirstUserMessage
} from '../harness/claude-code/sessions'

describe('workspace preview message selection', () => {
  test('uses the oldest Claude Code thread creation time', () => {
    expect(
      selectOldestSessionFirstUserMessage([
        {
          sessionId: 'recently-edited-oldest',
          firstPrompt: 'The first workspace message',
          createdAt: 100,
          lastModified: 900
        },
        {
          sessionId: 'newer',
          firstPrompt: 'A newer workspace message',
          createdAt: 200,
          lastModified: 300
        }
      ])
    ).toBe('The first workspace message')
  })

  test('falls back to last modified time when Claude Code creation time is missing', () => {
    expect(
      selectOldestSessionFirstUserMessage([
        { sessionId: 'newer', firstPrompt: 'Newer', lastModified: 20 },
        { sessionId: 'older', firstPrompt: 'Older', lastModified: 10 }
      ])
    ).toBe('Older')
  })

  test('uses the latest Claude Code thread activity time', () => {
    expect(
      selectLatestSessionUpdatedAt([
        { lastModified: 100 },
        { lastModified: 900 },
        { lastModified: 200 }
      ])
    ).toBe(900)
    expect(selectLatestSessionUpdatedAt([])).toBeUndefined()
  })

  test('uses the oldest OpenClaw transcript and strips stored message metadata', () => {
    const candidates: OpenClawSessionPreviewCandidate[] = [
      {
        key: 'newer',
        updatedAt: 200,
        detail: {
          messages: [{ role: 'user', content: 'A newer message', timestamp: 200 }]
        }
      },
      {
        key: 'oldest-but-recently-edited',
        updatedAt: 900,
        detail: {
          messages: [
            {
              role: 'user',
              content: '[Fri 2026-04-24 18:12 GMT+2] The first workspace message',
              timestamp: 100
            },
            { role: 'assistant', content: 'Reply', timestamp: 101 }
          ]
        }
      }
    ]

    expect(selectOldestOpenClawFirstUserMessage(candidates)).toBe('The first workspace message')
  })

  test('keeps an empty preview when the oldest OpenClaw thread has no user text', () => {
    const candidates: OpenClawSessionPreviewCandidate[] = [
      {
        key: 'oldest',
        updatedAt: 100,
        detail: {
          messages: [{ role: 'assistant', content: 'No user message', timestamp: 100 }]
        }
      },
      {
        key: 'newer',
        updatedAt: 200,
        detail: {
          messages: [{ role: 'user', content: 'Newer text', timestamp: 200 }]
        }
      }
    ]

    expect(selectOldestOpenClawFirstUserMessage(candidates)).toBeUndefined()
  })

  test('uses the latest OpenClaw thread activity time', () => {
    expect(
      selectLatestOpenClawUpdatedAt([{ updatedAt: 100 }, { updatedAt: 900 }, { updatedAt: 200 }])
    ).toBe(900)
    expect(selectLatestOpenClawUpdatedAt([])).toBeUndefined()
  })

  test('session-set signature ignores order and reflects membership changes', () => {
    expect(openClawSessionSetSignature([{ key: 'b' }, { key: 'a' }])).toBe(
      openClawSessionSetSignature([{ key: 'a' }, { key: 'b' }])
    )
    expect(openClawSessionSetSignature([{ key: 'a' }, { key: 'b' }])).not.toBe(
      openClawSessionSetSignature([{ key: 'a' }])
    )
    expect(openClawSessionSetSignature([{ key: 'a' }, { key: 'b' }])).not.toBe(
      openClawSessionSetSignature([{ key: 'a' }, { key: 'c' }])
    )
  })
})
