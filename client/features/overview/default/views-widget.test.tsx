import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { WorkspaceLayoutContext } from '@/client/features/workspace/workspace-layout-context'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import type { ViewInfo } from '@/lib/types'

import { ViewsWidget } from './views-widget'

const noop = () => {}

function render(views: ViewInfo[], showOnboarding = true, chatAvailable = true): string {
  const queryClient = new QueryClient()
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        WorkspaceLayoutContext.Provider,
        {
          value: {
            layout: createDefaultWorkspaceLayout(),
            setLayout: noop,
            name: null,
            cwd: null,
            provider: 'codex',
            workspaceId: 'workspace',
            chatAvailable,
            isLoading: false
          }
        },
        createElement(ViewsWidget, {
          views,
          onOpenView: noop,
          onCreateView: noop,
          showOnboarding
        })
      )
    )
  )
}

describe('ViewsWidget', () => {
  test('shows started builds and failed views while excluding unused drafts', () => {
    const html = render([
      { id: 'draft', status: 'draft', title: 'Unused draft', requirements: '' },
      { id: 'starting', status: 'starting', title: 'Starting view', requirements: 'Build' },
      { id: 'building', status: 'submitted', title: 'Building view', requirements: 'Build' },
      { id: 'failed', status: 'failed', title: 'Failed view', requirements: 'Build' }
    ])

    expect(html).not.toContain('Unused draft')
    for (const title of ['Starting view', 'Building view', 'Failed view']) {
      expect(html).toContain(`aria-label="Open ${title}"`)
    }
    expect(html).not.toContain('Create new views when you need separate pages for focused tasks')
  })

  test('renders view launchers in the supplied order', () => {
    const html = render([
      { id: 'roadmap', status: 'compiled', title: 'Roadmap', icon: 'calendar' },
      { id: 'reports', status: 'compiled', title: 'Reports', icon: 'chart' }
    ])

    expect(html.indexOf('Roadmap')).toBeLessThan(html.indexOf('Reports'))
    expect(html).toContain('>Views</h2>')
    expect(html).toContain('aria-label="Open Roadmap"')
    expect(html).toContain('aria-label="Open Reports"')
    expect(html).toContain('aria-label="View actions for Roadmap"')
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

  test('hides the empty-state hint outside onboarding', () => {
    const html = render([], false)

    expect(html).toContain('aria-label="Create new view"')
    expect(html).not.toContain('Create new views when you need separate pages for focused tasks')
  })
})

test('chat availability hides creation without hiding onboarding', () => {
  const html = render([], true, false)
  expect(html).not.toContain('New view')
  expect(html).toContain('Create new views when you need separate pages for focused tasks')
})
