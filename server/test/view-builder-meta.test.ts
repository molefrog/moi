import { describe, expect, test } from 'bun:test'

import { ClaudeAdapter } from '@/lib/claude-adapter'
import { appendViewBuilderMeta, stripViewBuilderMeta } from '@/lib/view-builder-meta'

import { stripUserMessageMetadata } from '../openclaw-strip'

describe('view builder message metadata', () => {
  test('adds agent instructions and restores the visible requirements', () => {
    const content = appendViewBuilderMeta('Build a project tracker', 'builder-123', [
      'chart',
      'calendar'
    ])
    expect(content).toContain('Available view icons: chart, calendar')
    expect(content).toContain('Your first action must be')
    expect(content).toContain('sentence-case title')
    expect(content).toContain('Capitalize only the first word')
    expect(content).toContain('moi view-builder claim --builder builder-123')
    expect(content).toContain('--icon <icon-id>')
    expect(content).toContain('before reading files')
    expect(stripViewBuilderMeta(content)).toBe('Build a project tracker')
  })

  test('keeps unrelated moi tags in user text', () => {
    const content = 'Explain this markup:\n\n<moi>hello</moi>'
    expect(stripViewBuilderMeta(content)).toBe(content)
  })

  test('strips metadata from Claude Code transcript replay', () => {
    const adapter = new ClaudeAdapter()
    const events = adapter.ingest({
      type: 'user',
      uuid: 'builder-turn',
      message: {
        role: 'user',
        content: appendViewBuilderMeta('Build a project tracker', 'builder-123', ['chart'])
      }
    })
    const event = events.find(candidate => candidate.kind === 'turn')
    if (event?.kind !== 'turn') throw new Error('expected user turn')
    expect(event.turn.parts).toEqual([{ type: 'text', text: 'Build a project tracker' }])
  })

  test('strips metadata from OpenClaw transcript replay', () => {
    const content = appendViewBuilderMeta('Build a project tracker', 'builder-123', ['chart'])
    expect(stripUserMessageMetadata(`[Wed 2026-07-15 10:00 GMT+2] ${content}`)).toBe(
      'Build a project tracker'
    )
  })
})
