// Render test for the streaming "Thinking" grouping behavior.
//
// Static server-render of the shared <TurnParts> path (which StreamingTail also
// uses) asserts the two states the user cares about:
//   1) live thinking (reasoning is the last row while processing) → labelled
//      "Thinking" and EXPANDED, so the streaming thought text is visible;
//   2) once text/tools follow, the reasoning is no longer the live row → labelled
//      "Thought" and COLLAPSED (its body is unmounted).
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import { TurnParts } from '@/client/components/TurnView'
import type { Part } from '@/lib/types'

const render = (parts: Part[], processing: boolean) =>
  renderToStaticMarkup(h(TurnParts, { parts, cwd: null, processing }))

describe('StreamingTail thinking grouping', () => {
  test('live thinking renders as an expanded "Thinking" group row', () => {
    const html = render([{ type: 'reasoning', text: 'I am thinking about X' }], true)
    expect(html).toContain('Thinking')
    expect(html).not.toContain('Thought')
    // Expanded → the streaming thought body is mounted and visible.
    // (title attribute + body both contain it → at least twice.)
    const occurrences = (html.match(/I am thinking about X/g) ?? []).length
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })

  test('once text follows, the thought collapses (body unmounted)', () => {
    const html = render(
      [
        { type: 'reasoning', text: 'DONE_THINKING' },
        { type: 'text', text: 'the answer' }
      ],
      true
    )
    // The trailing text is the live row now, so reasoning reads as done…
    expect(html).toContain('Thought')
    expect(html).toContain('the answer')
    // …and collapsed: the reasoning body is unmounted, so its text appears only
    // in the row's title attribute (exactly once), not in an expanded body.
    const occurrences = (html.match(/DONE_THINKING/g) ?? []).length
    expect(occurrences).toBe(1)
  })

  test('a lone text preview renders standalone (no thinking group)', () => {
    const html = render([{ type: 'text', text: 'just a streamed answer' }], true)
    expect(html).toContain('just a streamed answer')
    expect(html).not.toContain('Thinking')
    expect(html).not.toContain('Thought')
  })
})
