import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import { AgentBlobatar } from '@/client/components/shared/AgentBlobatar'

type AgentBlobatarOverrides = Partial<
  Pick<ComponentProps<typeof AgentBlobatar>, 'animate' | 'color' | 'preset'>
>

function renderAgentBlobatar(overrides: AgentBlobatarOverrides = {}): string {
  return renderToStaticMarkup(createElement(AgentBlobatar, { size: 20, ...overrides }))
}

describe('AgentBlobatar', () => {
  test('renders the deterministic boxy preset with hover animation by default', () => {
    const first = renderAgentBlobatar()
    const repeat = renderAgentBlobatar()
    const explicit = renderAgentBlobatar({ preset: 'boxy' })

    expect(first).toStartWith('<svg')
    expect(first).toContain('width="20"')
    expect(first).toContain('height="20"')
    expect(first).toContain('mo-root')
    expect(first).not.toContain('mo-always')
    expect(first).toContain('--mo-head:var(--foreground)')
    expect(first).toContain('--mo-eye:var(--background)')
    expect(first).toBe(repeat)
    expect(first).toBe(explicit)
  })

  test('renders a distinct fixed avatar for every preset', () => {
    const presets = ['round', 'boxy', 'capsule', 'triangle'] as const
    const avatars = presets.map(preset => renderAgentBlobatar({ preset }))

    expect(new Set(avatars).size).toBe(presets.length)
  })

  test('uses the same palette with always-on animation while active', () => {
    const html = renderAgentBlobatar({ animate: 'always' })

    expect(html).toStartWith('<svg')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('mo-root mo-always')
    expect(html).toContain('--mo-head:var(--foreground)')
    expect(html).toContain('--mo-eye:var(--background)')
  })

  test('supports the primary palette', () => {
    const html = renderAgentBlobatar({ color: 'primary' })

    expect(html).toContain('--mo-head:var(--primary)')
    expect(html).toContain('--mo-eye:var(--primary-foreground)')
  })
})
