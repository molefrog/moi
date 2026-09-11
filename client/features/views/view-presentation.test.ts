import { describe, expect, test } from 'bun:test'

import { IconArticle, IconCalendar, IconChartBar } from '@tabler/icons-react'

import type { ViewBuilder, ViewInfo } from '@/lib/types'

import { getViewIcon, getViewLabel } from './view-presentation'

const view = (config: ViewInfo['config']): ViewInfo => ({ id: 'roadmap', config })

describe('view presentation', () => {
  test('uses the configured title and icon', () => {
    const configured = view({ title: 'Roadmap', icon: 'calendar' })

    expect(getViewLabel(configured)).toBe('Roadmap')
    expect(getViewIcon(configured, [])).toBe(IconCalendar)
  })

  test('shares the builder and generic fallbacks used by workspace tabs', () => {
    const builder: ViewBuilder = {
      id: 'builder',
      kind: 'view',
      status: 'ready',
      input: { requirements: '' },
      sessionId: 'session',
      viewId: 'roadmap',
      icon: 'chart',
      createdAt: 0,
      updatedAt: 0
    }

    expect(getViewLabel(view({}))).toBe('roadmap')
    expect(getViewIcon(view({}), [builder])).toBe(IconChartBar)
    expect(getViewIcon(view({}), [])).toBe(IconArticle)
  })
})
