import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { ViewInfo } from '@/lib/types'

import { ViewsWidget } from './ViewsWidget'

const noop = () => {}

function render(views: ViewInfo[]): string {
  return renderToStaticMarkup(
    createElement(ViewsWidget, {
      views,
      builders: [],
      onOpenView: noop,
      onCreateView: noop
    })
  )
}

describe('ViewsWidget', () => {
  test('renders view launchers in the supplied order', () => {
    const html = render([
      { id: 'roadmap', config: { title: 'Roadmap', icon: 'calendar' } },
      { id: 'reports', config: { title: 'Reports', icon: 'chart' } }
    ])

    expect(html.indexOf('Roadmap')).toBeLessThan(html.indexOf('Reports'))
    expect(html).toContain('>Views</h2>')
    expect(html).toContain('aria-label="Open Roadmap"')
    expect(html).toContain('aria-label="Open Reports"')
    expect(html.indexOf('Reports')).toBeLessThan(html.indexOf('New view'))
    expect(html).toContain('aria-label="Create new view"')
    expect(html).not.toContain('Create new views when you need separate pages for focused tasks')
  })

  test('renders the new-view launcher as the only item before a view exists', () => {
    const html = render([])

    expect(html).toContain('New view')
    expect(html).toContain('>Views</h2>')
    expect(html).toContain('aria-label="Create new view"')
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).toContain('Create new views when you need separate pages for focused tasks')
  })
})
