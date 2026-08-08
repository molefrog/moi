// Render test for the shared <TurnParts> path used by both finalized turns and
// the live streaming preview turn. Asserts the two states that matter for
// streaming thinking:
//   1) live thinking (reasoning is the last row while processing) → "Thinking",
//      expanded;
//   2) once text/tools follow, the reasoning is no longer live → "Thought",
//      collapsed.
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import {
  AgentWorkDisclosure,
  AssistantTurnParts,
  TurnParts,
  splitCompletedAssistantParts
} from '@/client/features/chat/TurnView'
import type { Part } from '@/lib/types'

const render = (parts: Part[], processing: boolean) =>
  renderToStaticMarkup(h(TurnParts, { parts, cwd: null, processing }))

describe('TurnParts (shared render path)', () => {
  test('live thinking renders as an expanded "Thinking" group row', () => {
    const html = render([{ type: 'reasoning', text: 'I am thinking about X' }], true)
    expect(html).toContain('Thinking')
    expect(html).not.toContain('Thought')
    expect(html).toContain('aria-expanded="true"')
  })

  test('live thinking renders Markdown as plain text', () => {
    const html = render(
      [
        {
          type: 'reasoning',
          text: '**Inspecting components**\nPlanning with `code` and [a link](https://example.com)'
        }
      ],
      true
    )
    expect(html).toContain('Inspecting components')
    expect(html).toContain('Planning with code and a link')
    expect(html).not.toContain('**')
    expect(html).not.toContain('https://example.com')
  })

  test('once text follows, the thought collapses', () => {
    const html = render(
      [
        { type: 'reasoning', text: 'DONE_THINKING' },
        { type: 'text', text: 'the answer' }
      ],
      true
    )
    expect(html).toContain('Thought')
    expect(html).toContain('the answer')
    expect(html).toContain('aria-expanded="false"')
  })

  test('a lone text part renders standalone (no thinking group)', () => {
    const html = render([{ type: 'text', text: 'just a streamed answer' }], true)
    expect(html).toContain('just a streamed answer')
    expect(html).not.toContain('Thinking')
    expect(html).not.toContain('Thought')
  })
})

describe('completed assistant run', () => {
  const completedParts: Part[] = [
    { type: 'text', text: 'I will inspect it.' },
    { type: 'reasoning', text: 'HIDDEN_WORK' },
    { type: 'text', text: 'FINAL_RESPONSE' }
  ]

  test('splits after the last reasoning or tool step', () => {
    expect(splitCompletedAssistantParts(completedParts)).toEqual({
      work: completedParts.slice(0, 2),
      response: completedParts.slice(2)
    })
  })

  test('collapses prior work and keeps the final response visible', () => {
    const html = renderToStaticMarkup(
      h(AssistantTurnParts, {
        parts: completedParts,
        cwd: null,
        durationMs: 95_000
      })
    )

    expect(html).toContain('Worked for 1m 35s')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('FINAL_RESPONSE')
    expect(html).not.toContain('HIDDEN_WORK')
    expect(html).not.toContain('I will inspect it.')
  })

  test('shows the full run while processing', () => {
    const html = renderToStaticMarkup(
      h(AssistantTurnParts, { parts: completedParts, cwd: null, processing: true })
    )

    expect(html).not.toContain('Worked')
    expect(html).toContain('I will inspect it.')
    expect(html).toContain('Thought')
    expect(html).toContain('FINAL_RESPONSE')
  })

  test('expands the disclosure with the existing work renderer', () => {
    const html = renderToStaticMarkup(
      h(AgentWorkDisclosure, {
        parts: completedParts.slice(0, 2),
        cwd: null,
        defaultOpen: true
      })
    )

    expect(html).toContain('Worked')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('group/collapsible')
    expect(html).toContain('group-data-open/collapsible:rotate-90')
    expect(html).toContain('I will inspect it.')
    expect(html).toContain('Thought')
  })

  test('does not add a disclosure to a direct reply', () => {
    const html = renderToStaticMarkup(
      h(AssistantTurnParts, {
        parts: [{ type: 'text', text: 'DIRECT_RESPONSE' }],
        cwd: null,
        durationMs: 1_000
      })
    )

    expect(html).toContain('DIRECT_RESPONSE')
    expect(html).not.toContain('Worked')
  })

  test('keeps work visible when there is no trailing response', () => {
    const html = renderToStaticMarkup(
      h(AssistantTurnParts, {
        parts: [{ type: 'reasoning', text: 'UNFINISHED_WORK' }],
        cwd: null
      })
    )

    expect(html).toContain('Thought')
    expect(html).not.toContain('Worked')
  })
})
