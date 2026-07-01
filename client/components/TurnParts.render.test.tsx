// Render test for the shared <TurnParts> path used by both finalized turns and
// the live streaming preview turn. Asserts the two states that matter for
// streaming thinking:
//   1) live thinking (reasoning is the last row while processing) → "Thinking",
//      EXPANDED (streaming thought visible);
//   2) once text/tools follow, the reasoning is no longer live → "Thought",
//      COLLAPSED (body unmounted).
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import { TurnParts } from '@/client/components/TurnView'
import type { Part } from '@/lib/types'

const render = (parts: Part[], processing: boolean) =>
  renderToStaticMarkup(h(TurnParts, { parts, cwd: null, processing }))

describe('TurnParts (shared render path)', () => {
  test('live thinking renders as an expanded "Thinking" group row', () => {
    const html = render([{ type: 'reasoning', text: 'I am thinking about X' }], true)
    expect(html).toContain('Thinking')
    expect(html).not.toContain('Thought')
    // Expanded → body mounted; the thought appears in both title and body.
    expect((html.match(/I am thinking about X/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  test('once text follows, the thought collapses (body unmounted)', () => {
    const html = render(
      [
        { type: 'reasoning', text: 'DONE_THINKING' },
        { type: 'text', text: 'the answer' }
      ],
      true
    )
    expect(html).toContain('Thought')
    expect(html).toContain('the answer')
    // Collapsed → reasoning body unmounted; its text only in the title (once).
    expect((html.match(/DONE_THINKING/g) ?? []).length).toBe(1)
  })

  test('a lone text part renders standalone (no thinking group)', () => {
    const html = render([{ type: 'text', text: 'just a streamed answer' }], true)
    expect(html).toContain('just a streamed answer')
    expect(html).not.toContain('Thinking')
    expect(html).not.toContain('Thought')
  })
})
