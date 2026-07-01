// Tests for <StreamingTail>'s two halves:
//   - the pure display view (<StreamingTailView>), rendered for real across every
//     preview shape + the dots fallback (SSR is fine — it's prop-driven);
//   - the pure selection/mapping logic the store-connected shell relies on
//     (selectPreviews root-vs-subagent + session isolation; previewBlocksToParts
//     empty-filtering + kind mapping + order).
// The store-connected shell itself is a trivial `selectPreviews(...).root` +
// pass-through, so these two halves fully cover its behavior.
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import { StreamingTailView, previewBlocksToParts } from '@/client/components/StreamingTail'
import { type LivePreview, selectPreviews } from '@/client/store/live'
import type { PreviewBlock } from '@/lib/types'

const WS = 'ws1'
const SID = 'sess-1'

const preview = (blocks: PreviewBlock[], parentToolUseId: string | null = null): LivePreview => ({
  workspaceId: WS,
  sessionId: SID,
  parentToolUseId,
  blocks,
  updatedAt: 1
})
const render = (root: LivePreview | null, processing: boolean) =>
  renderToStaticMarkup(h(StreamingTailView, { root, processing }))

describe('StreamingTailView (display)', () => {
  test('no preview + processing → pulsing dots', () => {
    expect(render(null, true)).toContain('pulse-dot')
  })

  test('no preview, not processing → renders nothing', () => {
    expect(render(null, false)).toBe('')
  })

  test('text-only preview → standalone text, no thinking group, no dots', () => {
    const html = render(preview([{ index: 0, kind: 'text', text: 'a streamed answer' }]), true)
    expect(html).toContain('a streamed answer')
    expect(html).not.toContain('Thinking')
    expect(html).not.toContain('Thought')
    expect(html).not.toContain('pulse-dot')
  })

  test('reasoning-only preview → expanded "Thinking" group', () => {
    const html = render(preview([{ index: 0, kind: 'reasoning', text: 'MID_THOUGHT' }]), true)
    expect(html).toContain('Thinking')
    expect(html).not.toContain('Thought')
    // Expanded → body mounted; text appears in both title and body.
    expect((html.match(/MID_THOUGHT/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  test('reasoning + text preview → collapsed "Thought" above the text', () => {
    const html = render(
      preview([
        { index: 0, kind: 'reasoning', text: 'PRIOR_THOUGHT' },
        { index: 1, kind: 'text', text: 'the final answer' }
      ]),
      true
    )
    expect(html).toContain('Thought')
    expect(html).toContain('the final answer')
    // Collapsed → reasoning body unmounted; its text only in the title (once).
    expect((html.match(/PRIOR_THOUGHT/g) ?? []).length).toBe(1)
  })

  test('empty (not-yet-visible) blocks are filtered → falls back to dots', () => {
    expect(render(preview([{ index: 0, kind: 'text', text: '' }]), true)).toContain('pulse-dot')
  })
})

describe('previewBlocksToParts', () => {
  test('drops empty blocks and maps kinds, preserving order', () => {
    expect(
      previewBlocksToParts([
        { index: 0, kind: 'reasoning', text: 'think' },
        { index: 1, kind: 'text', text: '' },
        { index: 2, kind: 'text', text: 'answer' }
      ])
    ).toEqual([
      { type: 'reasoning', text: 'think' },
      { type: 'text', text: 'answer' }
    ])
  })

  test('all-empty → no parts', () => {
    expect(previewBlocksToParts([{ index: 0, kind: 'text', text: '' }])).toEqual([])
  })
})

describe('selectPreviews', () => {
  const P = (
    messageId: string,
    parentToolUseId: string | null,
    sessionId: string,
    updatedAt = 1
  ): [string, LivePreview] => [
    messageId,
    { workspaceId: WS, sessionId, parentToolUseId, blocks: [], updatedAt }
  ]

  test('splits the root stream from per-subagent streams', () => {
    const previews = Object.fromEntries([P('msg_ROOT', null, SID), P('msg_SUB', 'toolu_1', SID)])
    const { root, byParent } = selectPreviews(previews, WS, SID)
    expect(root?.parentToolUseId).toBe(null)
    expect(byParent['toolu_1']?.parentToolUseId).toBe('toolu_1')
  })

  test('ignores previews from other sessions / workspaces', () => {
    const previews = Object.fromEntries([P('msg_MINE', null, SID), P('msg_OTHER', null, 'sess-2')])
    const mine = previews['msg_MINE']
    expect(selectPreviews(previews, WS, SID).root).toBe(mine)
    expect(selectPreviews(previews, WS, 'sess-2').root).not.toBe(mine)
  })

  test('keeps the freshest root when more than one exists', () => {
    const previews = Object.fromEntries([P('old', null, SID, 1), P('new', null, SID, 2)])
    expect(selectPreviews(previews, WS, SID).root).toBe(previews['new'])
  })

  test('null session → empties', () => {
    const previews = Object.fromEntries([P('msg', null, SID)])
    expect(selectPreviews(previews, WS, null)).toEqual({ root: null, byParent: {} })
  })
})
