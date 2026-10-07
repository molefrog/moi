import { describe, expect, test } from 'bun:test'

import type { ViewInfo, WorkspaceTabsState } from '@/lib/types'

import {
  effectiveOpenTabs,
  normalizeTabsState,
  resolveActiveTab,
  tabAvailable
} from './tab-resolution'

const views: ViewInfo[] = [
  { id: 'orders', status: 'compiled', title: 'Orders' },
  {
    id: 'draft',
    status: 'draft',
    requirements: ''
  }
]

const tabs = (open: WorkspaceTabsState['open'], active: WorkspaceTabsState['active']) => ({
  open,
  active
})

describe('normalizeTabsState', () => {
  test('falls back to defaults on missing/empty state', () => {
    expect(normalizeTabsState(undefined)).toEqual({
      open: ['overview', 'scratchpad'],
      active: 'overview'
    })
    expect(normalizeTabsState(tabs([], 'scratchpad'))).toEqual({
      open: ['overview', 'scratchpad'],
      active: 'overview'
    })
  })

  test('pins Overview first, dedupes open, and preserves a valid active tab', () => {
    expect(
      normalizeTabsState(tabs(['scratchpad', 'overview', 'scratchpad'], 'scratchpad'))
    ).toEqual({
      open: ['overview', 'scratchpad'],
      active: 'scratchpad'
    })
  })
})

describe('tabAvailable', () => {
  test('static tabs always exist', () => {
    expect(tabAvailable('overview', [])).toBe(true)
    expect(tabAvailable('scratchpad', [])).toBe(true)
  })

  test('view tabs track the unified view list', () => {
    expect(tabAvailable('views/orders', views)).toBe(true)
    expect(tabAvailable('views/draft', views)).toBe(true)
    expect(tabAvailable('views/gone', views)).toBe(false)
  })
})

describe('effectiveOpenTabs', () => {
  test('filters unavailable tabs and keeps order', () => {
    expect(
      effectiveOpenTabs(tabs(['views/gone', 'scratchpad', 'views/orders'], 'scratchpad'), views)
    ).toEqual(['scratchpad', 'views/orders'])
  })

  test('falls back to the default open set when nothing survives', () => {
    expect(effectiveOpenTabs(tabs(['views/gone'], 'views/gone'), [])).toEqual([
      'overview',
      'scratchpad'
    ])
  })
})

describe('resolveActiveTab', () => {
  const state = tabs(['overview', 'scratchpad', 'views/orders'], 'overview')

  test('a bare URL resolves to the saved default', () => {
    expect(resolveActiveTab(null, state, views)).toBe('overview')
  })

  test('a valid URL tab wins, even when not in the open set', () => {
    expect(resolveActiveTab('views/orders', state, views)).toBe('views/orders')
    expect(resolveActiveTab('scratchpad', state, views)).toBe('scratchpad')
  })

  test('an unavailable explicit destination stays selected for recovery', () => {
    expect(resolveActiveTab('views/gone', state, views)).toBe('views/gone')
  })

  test('an unavailable saved default falls back to the first surviving tab', () => {
    const stale = tabs(['views/gone', 'views/orders'], 'views/gone')
    expect(resolveActiveTab(null, stale, views)).toBe('views/orders')
  })

  test('when nothing survives, the default open set answers', () => {
    const dead = tabs(['views/gone'], 'views/gone')
    expect(resolveActiveTab(null, dead, [])).toBe('overview')
  })
})
