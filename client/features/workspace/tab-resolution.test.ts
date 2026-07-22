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
    expect(normalizeTabsState(undefined)).toEqual({ open: ['agent', 'widgets'], active: 'agent' })
    expect(normalizeTabsState(tabs([], 'agent'))).toEqual({
      open: ['agent', 'widgets'],
      active: 'agent'
    })
  })

  test('dedupes open and repairs an active outside the open set', () => {
    expect(normalizeTabsState(tabs(['agent', 'agent', 'widgets'], 'scratchpad'))).toEqual({
      open: ['agent', 'widgets'],
      active: 'agent'
    })
  })
})

describe('tabAvailable', () => {
  test('static tabs always exist', () => {
    expect(tabAvailable('agent', [], [])).toBe(true)
    expect(tabAvailable('widgets', [], [])).toBe(true)
    expect(tabAvailable('scratchpad', [], [])).toBe(true)
  })

  test('view and builder tabs track their backing lists', () => {
    expect(tabAvailable('view:orders', views, [])).toBe(true)
    expect(tabAvailable('view:gone', views, [])).toBe(false)
    expect(tabAvailable('view-builder:b1', [], builders)).toBe(true)
    expect(tabAvailable('view-builder:b2', [], builders)).toBe(false)
  })
})

describe('effectiveOpenTabs', () => {
  test('filters unavailable tabs and keeps order', () => {
    expect(
      effectiveOpenTabs(tabs(['view:gone', 'agent', 'view:orders'], 'agent'), views, [])
    ).toEqual(['agent', 'view:orders'])
  })

  test('falls back to the default open set when nothing survives', () => {
    expect(effectiveOpenTabs(tabs(['view:gone'], 'view:gone'), [], [])).toEqual([
      'agent',
      'widgets'
    ])
  })
})

describe('resolveActiveTab', () => {
  const state = tabs(['agent', 'widgets', 'view:orders'], 'widgets')

  test('a bare URL resolves to the saved default', () => {
    expect(resolveActiveTab(null, state, views, [], false)).toBe('widgets')
  })

  test('a valid URL tab wins, even when not in the open set', () => {
    expect(resolveActiveTab('view:orders', state, views, [], false)).toBe('view:orders')
    expect(resolveActiveTab('scratchpad', state, views, [], false)).toBe('scratchpad')
  })

  test('an unavailable URL tab falls back to the default', () => {
    expect(resolveActiveTab('view:gone', state, views, [], false)).toBe('widgets')
    expect(resolveActiveTab('view-builder:b2', state, views, [], false)).toBe('widgets')
  })

  test('an unavailable saved default falls back to the first surviving tab', () => {
    const stale = tabs(['view:gone', 'view:orders'], 'view:gone')
    expect(resolveActiveTab(null, stale, views, [], false)).toBe('view:orders')
  })

  test('when nothing survives, the default open set answers', () => {
    const dead = tabs(['view:gone'], 'view:gone')
    expect(resolveActiveTab(null, dead, [], [], false)).toBe('agent')
  })

  test('split mode: agent is not a workspace tab, a visible tab is derived', () => {
    expect(resolveActiveTab('agent', state, views, [], true)).toBe('widgets')
    const agentDefault = tabs(['agent', 'view:orders'], 'agent')
    expect(resolveActiveTab(null, agentDefault, views, [], true)).toBe('view:orders')
  })

  test('split mode: non-agent URL tabs still win', () => {
    expect(resolveActiveTab('view:orders', state, views, [], true)).toBe('view:orders')
  })
})
