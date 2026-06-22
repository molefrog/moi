import { describe, expect, test } from 'bun:test'

import { ClaudeAdapter } from '@/lib/claude-adapter'
import type { Part } from '@/lib/format'

// A persisted user message with an inline base64 image block (what the SDK
// writes to the session .jsonl when an image is attached) should reconstruct
// into a `file` part with a data URL, so the attachment re-renders on cold load.
describe('ClaudeAdapter image attachments', () => {
  test('base64 image source → file part with data URL', () => {
    const adapter = new ClaudeAdapter()
    const events = adapter.ingest({
      type: 'user',
      uuid: 'u1',
      message: {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'AAAA' }
          },
          { type: 'text', text: 'what is this?' }
        ]
      }
    })

    const turn = events.find(e => e.kind === 'turn')
    expect(turn).toBeDefined()
    if (turn?.kind !== 'turn') throw new Error('expected a turn event')

    const parts = turn.turn.parts
    const file = parts.find((p): p is Extract<Part, { type: 'file' }> => p.type === 'file')
    expect(file).toBeDefined()
    expect(file?.mediaType).toBe('image/png')
    expect(file?.url).toBe('data:image/png;base64,AAAA')

    const text = parts.find(p => p.type === 'text')
    expect(text).toBeDefined()
  })

  test('image block with a bare url is passed through', () => {
    const adapter = new ClaudeAdapter()
    const events = adapter.ingest({
      type: 'user',
      uuid: 'u2',
      message: {
        role: 'user',
        content: [{ type: 'image', media_type: 'image/jpeg', url: 'https://x/y.jpg' }]
      }
    })
    const turn = events.find(e => e.kind === 'turn')
    if (turn?.kind !== 'turn') throw new Error('expected a turn event')
    const file = turn.turn.parts.find(
      (p): p is Extract<Part, { type: 'file' }> => p.type === 'file'
    )
    expect(file?.url).toBe('https://x/y.jpg')
  })
})
