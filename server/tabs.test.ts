import { describe, expect, test } from 'bun:test'

import type { ViewInfo } from '@/lib/types'

import { assembleTabRows, assertNavigableTab } from './tabs'

const views: ViewInfo[] = [
  { id: 'roadmap', config: { title: 'Roadmap' } },
  { id: 'orders', config: { title: '' } }
]

describe('assembleTabRows', () => {
  test('lists static tabs then views, marking the saved default', () => {
    const rows = assembleTabRows(views, 'views/roadmap')
    expect(rows.map(r => r.id)).toEqual([
      'overview',
      'agent',
      'scratchpad',
      'views/roadmap',
      'views/orders'
    ])
    expect(rows.find(r => r.isDefault)?.id).toBe('views/roadmap')
  })

  test('falls back to the view id when the title is empty', () => {
    const rows = assembleTabRows(views, 'agent')
    expect(rows.find(r => r.id === 'views/orders')?.title).toBe('orders')
    expect(rows.find(r => r.id === 'views/roadmap')?.title).toBe('Roadmap')
  })

  test('a default that maps to no row marks nothing', () => {
    const rows = assembleTabRows(views, 'view-builders/abc')
    expect(rows.every(r => !r.isDefault)).toBe(true)
  })
})

test('discovery includes portable links but no singleton chat contract', () => {
  const rows = assembleTabRows(views, 'overview')
  expect(rows.find(row => row.id === 'views/orders')?.href).toBe('moi:/views/orders')
  expect(rows.find(row => row.id === 'agent')?.href).toBeUndefined()
})

describe('assertNavigableTab', () => {
  test('accepts built-in destinations and built views', () => {
    expect(() => assertNavigableTab('overview', views)).not.toThrow()
    expect(() => assertNavigableTab('scratchpad', views)).not.toThrow()
    expect(() => assertNavigableTab('views/orders', views)).not.toThrow()
  })

  test('lists the current addresses when a view is missing', () => {
    expect(() => assertNavigableTab('views/order', views)).toThrow(
      'Unknown destination "moi:/views/order". Valid addresses: moi:/overview, moi:/scratchpad, moi:/views/roadmap, moi:/views/orders'
    )
  })
})
