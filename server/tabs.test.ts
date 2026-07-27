import { describe, expect, test } from 'bun:test'

import type { ViewInfo } from '@/lib/types'

import { assembleTabRows, resolveFocusTab } from './tabs'

const views: ViewInfo[] = [
  { id: 'roadmap', config: { title: 'Roadmap' } },
  { id: 'orders', config: { title: '' } }
]

describe('assembleTabRows', () => {
  test('lists static tabs then views, marking the saved default', () => {
    const rows = assembleTabRows(views, 'view:roadmap')
    expect(rows.map(r => r.id)).toEqual([
      'agent',
      'widgets',
      'scratchpad',
      'view:roadmap',
      'view:orders'
    ])
    expect(rows.find(r => r.isDefault)?.id).toBe('view:roadmap')
  })

  test('falls back to the view id when the title is empty', () => {
    const rows = assembleTabRows(views, 'agent')
    expect(rows.find(r => r.id === 'view:orders')?.title).toBe('orders')
    expect(rows.find(r => r.id === 'view:roadmap')?.title).toBe('Roadmap')
  })

  test('a default that maps to no row marks nothing', () => {
    const rows = assembleTabRows(views, 'view-builder:abc')
    expect(rows.every(r => !r.isDefault)).toBe(true)
  })
})

describe('resolveFocusTab', () => {
  const deps = {
    hasView: (id: string) => Promise.resolve(id === 'roadmap'),
    viewList: () => Promise.resolve(views)
  }

  test('accepts static tab ids', async () => {
    expect(await resolveFocusTab('agent', deps)).toEqual({ ok: true, tab: 'agent' })
    expect(await resolveFocusTab('scratchpad', deps)).toEqual({ ok: true, tab: 'scratchpad' })
  })

  test('accepts a view tab whose view exists', async () => {
    expect(await resolveFocusTab('view:roadmap', deps)).toEqual({ ok: true, tab: 'view:roadmap' })
  })

  test('rejects an unknown view id, listing the valid ids', async () => {
    const result = await resolveFocusTab('view:nope', deps)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('view:nope')
      expect(result.error).toContain('agent, widgets, scratchpad, view:roadmap, view:orders')
    }
  })

  test('rejects view-builder tabs and garbage', async () => {
    expect((await resolveFocusTab('view-builder:abc', deps)).ok).toBe(false)
    expect((await resolveFocusTab('Roadmap', deps)).ok).toBe(false)
    expect((await resolveFocusTab('', deps)).ok).toBe(false)
    expect((await resolveFocusTab(undefined, deps)).ok).toBe(false)
  })
})
