import { describe, expect, test } from 'bun:test'

import { ClaudeAdapter } from '../harness/claude-code/adapter'
import { renderMoiContext } from '@/lib/moi-context'
import { stripViewBuilderMeta, viewBuilderDirectives } from '@/lib/view-builder-meta'

import { stripUserMessageMetadata } from '../harness/openclaw/strip'

// What view-builder sends used to look like before the directives moved into
// the moi-context envelope — still persisted in old transcripts.
const LEGACY_CONTENT = [
  'Build a project tracker',
  '',
  '<moi>',
  'View builder request',
  'Builder id: builder-123',
  'Available view icons: chart',
  '</moi>'
].join('\n')

describe('view builder directives', () => {
  test('render into the moi-context envelope with the agent instructions', () => {
    const context = renderMoiContext({
      activeTab: 'view-builder:builder-123',
      directives: viewBuilderDirectives('builder-123', ['chart', 'calendar'])
    })
    expect(context).toContain('The user is on: view builder "builder-123"')
    expect(context).toContain('View builder request')
    expect(context).toContain('Builder id: builder-123')
    expect(context).toContain('Available view icons: chart, calendar')
    expect(context).toContain('Your first action must be')
    expect(context).toContain('sentence-case title')
    expect(context).toContain('Capitalize only the first word')
    expect(context).toContain('moi builder set <view-id> --builder builder-123 --kind view')
    expect(context).toContain('--icon <icon-id>')
    expect(context).toContain('before reading files')
  })
})

describe('legacy <moi> block stripping', () => {
  test('restores the visible requirements', () => {
    expect(stripViewBuilderMeta(LEGACY_CONTENT)).toBe('Build a project tracker')
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
        content: LEGACY_CONTENT
      }
    })
    const event = events.find(candidate => candidate.kind === 'turn')
    if (event?.kind !== 'turn') throw new Error('expected user turn')
    expect(event.turn.parts).toEqual([{ type: 'text', text: 'Build a project tracker' }])
  })

  test('strips metadata from OpenClaw transcript replay', () => {
    expect(stripUserMessageMetadata(`[Wed 2026-07-15 10:00 GMT+2] ${LEGACY_CONTENT}`)).toBe(
      'Build a project tracker'
    )
  })
})
