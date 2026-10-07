import { describe, expect, test } from 'bun:test'

import { IconArticle, IconCalendar } from '@tabler/icons-react'

import type { CompiledView, ViewConfig } from '@/lib/types'

import { getViewIcon, getViewLabel } from './view-presentation'

const view = (config: ViewConfig): CompiledView => ({
  id: 'roadmap',
  status: 'compiled',
  ...config,
  title: config.title || 'roadmap'
})

describe('view presentation', () => {
  test('uses the configured title and icon', () => {
    const configured = view({ title: 'Roadmap', icon: 'calendar' })

    expect(getViewLabel(configured)).toBe('Roadmap')
    expect(getViewIcon(configured)).toBe(IconCalendar)
  })

  test('uses generic defaults when config has no title or icon', () => {
    expect(getViewLabel(view({}))).toBe('roadmap')
    expect(getViewIcon(view({}))).toBe(IconArticle)
  })
})
