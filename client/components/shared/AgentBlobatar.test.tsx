import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import {
  AgentBlobatar,
  type AgentBlobatarExpression
} from '@/client/components/shared/AgentBlobatar'
import { AGENT_THEMES } from '@/lib/themes'

const EXPRESSIONS = [
  'idle',
  'happy',
  'sad',
  'surprised',
  'wink',
  'sleepy',
  'smug',
  'unsure',
  'shy',
  'thinking'
] satisfies AgentBlobatarExpression[]

type AgentBlobatarOverrides = Partial<
  Pick<ComponentProps<typeof AgentBlobatar>, 'animated' | 'color' | 'expression' | 'preset'>
>

function renderAgentBlobatar(overrides: AgentBlobatarOverrides = {}): string {
  return renderToStaticMarkup(createElement(AgentBlobatar, { size: 20, ...overrides }))
}

describe('AgentBlobatar', () => {
  test('renders a deterministic svg at the requested size', () => {
    const html = renderAgentBlobatar()

    expect(html).toStartWith('<svg')
    expect(html).toContain('width="20"')
    expect(html).toContain('height="20"')
    expect(html).toBe(renderAgentBlobatar())
  })

  test('renders a distinct avatar for every preset', () => {
    const presets = Object.keys(AGENT_THEMES) as (keyof typeof AGENT_THEMES)[]
    const avatars = presets.map(preset => renderAgentBlobatar({ preset }))

    expect(new Set(avatars).size).toBe(presets.length)
  })

  test('renders a distinct avatar for every expression', () => {
    const avatars = EXPRESSIONS.map(expression => renderAgentBlobatar({ expression }))

    expect(new Set(avatars).size).toBe(EXPRESSIONS.length)
  })

  test('animating changes the rendered output', () => {
    expect(renderAgentBlobatar({ animated: true })).not.toBe(renderAgentBlobatar())
  })

  test('maps colors to semantic theme tokens', () => {
    expect(renderAgentBlobatar()).toContain('var(--foreground)')
    expect(renderAgentBlobatar({ color: 'primary' })).toContain('var(--primary)')
    expect(renderAgentBlobatar({ color: 'secondary' })).toContain('var(--accent)')
  })
})
