import { describe, expect, test } from 'bun:test'

import type { ViewBuilder, ViewInfo, WorkspaceTabsState } from '@/lib/types'

import {
  effectiveOpenTabs,
  normalizeTabsState,
  resolveActiveTab,
  tabAvailable
} from './tab-resolution'

const views: ViewInfo[] = [{ id: 'orders', config: { title: 'Orders' } }]

const builder = { id: 'b1', status: 'draft' } as ViewBuilder
const builders: ViewBuilder[] = [builder]

const tabs = (open: WorkspaceTabsState['open'], active: WorkspaceTabsState['active']) => ({
  open,
  active
})

describe('normalizeTabsState', () => {
  test('falls back to defaults on missing/empty state', () => {
    expect(normalizeTabsState(undefined)).toEqual({
      open: ['overview', 'agent', 'scratchpad'],
      active: 'overview'
    })
    expect(normalizeTabsState(tabs([], 'agent'))).toEqual({
      open: ['overview', 'agent', 'scratchpad'],
      active: 'overview'
    })
  })

  test('pins Overview first, dedupes open, and preserves a valid active tab', () => {
    expect(normalizeTabsState(tabs(['agent', 'overview', 'agent'], 'agent'))).toEqual({
      open: ['overview', 'agent'],
      active: 'agent'
    })
  })
})

describe('tabAvailable', () => {
  test('static tabs always exist', () => {
    expect(tabAvailable('overview', [], [])).toBe(true)
    expect(tabAvailable('agent', [], [])).toBe(true)
    expect(tabAvailable('scratchpad', [], [])).toBe(true)
  })

  test('view and builder tabs track their backing lists', () => {
    expect(tabAvailable('views/orders', views, [])).toBe(true)
    expect(tabAvailable('views/gone', views, [])).toBe(false)
    expect(tabAvailable('view-builders/b1', [], builders)).toBe(true)
    expect(tabAvailable('view-builders/b2', [], builders)).toBe(false)
  })
})

describe('effectiveOpenTabs', () => {
  test('filters unavailable tabs and keeps order', () => {
    expect(
      effectiveOpenTabs(tabs(['views/gone', 'agent', 'views/orders'], 'agent'), views, [])
    ).toEqual(['agent', 'views/orders'])
  })

  test('falls back to the default open set when nothing survives', () => {
    expect(effectiveOpenTabs(tabs(['views/gone'], 'views/gone'), [], [])).toEqual([
      'overview',
      'agent',
      'scratchpad'
    ])
  })
})

describe('resolveActiveTab', () => {
  const state = tabs(['overview', 'agent', 'views/orders'], 'overview')

  test('a bare URL resolves to the saved default', () => {
    expect(resolveActiveTab(null, state, views, [], false)).toBe('overview')
  })

  test('a valid URL tab wins, even when not in the open set', () => {
    expect(resolveActiveTab('views/orders', state, views, [], false)).toBe('views/orders')
    expect(resolveActiveTab('scratchpad', state, views, [], false)).toBe('scratchpad')
  })

  test('an unavailable explicit destination stays selected for recovery', () => {
    expect(resolveActiveTab('views/gone', state, views, [], false)).toBe('views/gone')
    expect(resolveActiveTab('view-builders/b2', state, views, [], false)).toBe('view-builders/b2')
  })

  test('an unavailable saved default falls back to the first surviving tab', () => {
    const stale = tabs(['views/gone', 'views/orders'], 'views/gone')
    expect(resolveActiveTab(null, stale, views, [], false)).toBe('views/orders')
  })

  test('when nothing survives, the default open set answers', () => {
    const dead = tabs(['views/gone'], 'views/gone')
    expect(resolveActiveTab(null, dead, [], [], false)).toBe('overview')
  })

  test('split mode: agent is not a workspace tab, a visible tab is derived', () => {
    expect(resolveActiveTab('agent', state, views, [], true)).toBe('overview')
    const agentDefault = tabs(['agent', 'views/orders'], 'agent')
    expect(resolveActiveTab(null, agentDefault, views, [], true)).toBe('views/orders')
  })

  test('split mode: non-agent URL tabs still win', () => {
    expect(resolveActiveTab('views/orders', state, views, [], true)).toBe('views/orders')
  })
})
