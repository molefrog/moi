import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import { AgentBlobatar } from '@/client/components/shared/AgentBlobatar'

type AgentBlobatarOverrides = Partial<
  Pick<ComponentProps<typeof AgentBlobatar>, 'animate' | 'color'>
>

function renderAgentBlobatar(name: string, overrides: AgentBlobatarOverrides = {}): string {
  return renderToStaticMarkup(createElement(AgentBlobatar, { name, size: 20, ...overrides }))
}

describe('AgentBlobatar', () => {
  test('renders a deterministic avatar with hover animation by default', () => {
    const first = renderAgentBlobatar('Test workspace')
    const repeat = renderAgentBlobatar('Test workspace')
    const different = renderAgentBlobatar('Another workspace')

    expect(first).toStartWith('<svg')
    expect(first).toContain('width="20"')
    expect(first).toContain('height="20"')
    expect(first).toContain('mo-root')
    expect(first).not.toContain('mo-always')
    expect(first).toContain('--mo-head:var(--foreground)')
    expect(first).toContain('--mo-eye:var(--background)')
    expect(first).toBe(repeat)
    expect(first).not.toBe(different)
  })

  test('uses the same palette with always-on animation while active', () => {
    const html = renderAgentBlobatar('Test workspace', { animate: 'always' })

    expect(html).toStartWith('<svg')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('mo-root mo-always')
    expect(html).toContain('--mo-head:var(--foreground)')
    expect(html).toContain('--mo-eye:var(--background)')
  })

  test('supports the primary palette', () => {
    const html = renderAgentBlobatar('Test workspace', { color: 'primary' })

    expect(html).toContain('--mo-head:var(--primary)')
    expect(html).toContain('--mo-eye:var(--primary-foreground)')
  })
})
