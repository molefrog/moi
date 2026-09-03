import { describe, expect, test } from 'bun:test'

import type { ViewBuilder, ViewInfo, WorkspaceTabsState } from '@/lib/types'

import {
  effectiveOpenTabs,
  isStaleTabLink,
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
      'overview',
      'agent',
      'scratchpad'
    ])
  })
})

describe('resolveActiveTab', () => {
  const state = tabs(['overview', 'agent', 'view:orders'], 'overview')

  test('a bare URL resolves to the saved default', () => {
    expect(resolveActiveTab(null, state, views, [], false)).toBe('overview')
  })

  test('a valid URL tab wins, even when not in the open set', () => {
    expect(resolveActiveTab('view:orders', state, views, [], false)).toBe('view:orders')
    expect(resolveActiveTab('scratchpad', state, views, [], false)).toBe('scratchpad')
  })

  test('an unavailable URL tab falls back to the default', () => {
    expect(resolveActiveTab('view:gone', state, views, [], false)).toBe('overview')
    expect(resolveActiveTab('view-builder:b2', state, views, [], false)).toBe('overview')
  })

  test('an unavailable saved default falls back to the first surviving tab', () => {
    const stale = tabs(['view:gone', 'view:orders'], 'view:gone')
    expect(resolveActiveTab(null, stale, views, [], false)).toBe('view:orders')
  })

  test('when nothing survives, the default open set answers', () => {
    const dead = tabs(['view:gone'], 'view:gone')
    expect(resolveActiveTab(null, dead, [], [], false)).toBe('overview')
  })

  test('split mode: agent is not a workspace tab, a visible tab is derived', () => {
    expect(resolveActiveTab('agent', state, views, [], true)).toBe('overview')
    const agentDefault = tabs(['agent', 'view:orders'], 'agent')
    expect(resolveActiveTab(null, agentDefault, views, [], true)).toBe('view:orders')
  })

  test('split mode: non-agent URL tabs still win', () => {
    expect(resolveActiveTab('view:orders', state, views, [], true)).toBe('view:orders')
  })
})

// Which lost redirects are worth a line in `moi debug logs`. The cost of a
// false positive is an agent chasing a link that was never broken.
describe('isStaleTabLink', () => {
  test('a view tab that lost its redirect is stale — the view is gone', () => {
    expect(isStaleTabLink('view:gone')).toBe(true)
  })

  test('a segment that is not a tab id at all is stale', () => {
    expect(isStaleTabLink('nonsense')).toBe(true)
    expect(isStaleTabLink('view:multi/segment')).toBe(true)
  })

  test('a bare workspace URL names nothing, so it is not a broken link', () => {
    expect(isStaleTabLink('')).toBe(false)
    expect(isStaleTabLink(null)).toBe(false)
    expect(isStaleTabLink(undefined)).toBe(false)
  })

  test('the agent tab is never stale — split mode redirects it by design', () => {
    expect(isStaleTabLink('agent')).toBe(false)
    expect(isStaleTabLink('overview')).toBe(false)
    expect(isStaleTabLink('scratchpad')).toBe(false)
  })

  test('a builder tab is never stale — it is swapped for its view when built', () => {
    expect(isStaleTabLink('view-builder:b1')).toBe(false)
  })
})
