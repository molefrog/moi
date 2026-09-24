import { describe, expect, test } from 'bun:test'

import type { ViewInfo } from '@/lib/types'

import { assembleTabRows, assertNavigableTab } from './tabs'

const views: ViewInfo[] = [
  { id: 'roadmap', status: 'compiled', title: 'Roadmap' },
  { id: 'orders', status: 'compiled', title: '' }
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

  test('pending views are ordinary navigable rows', () => {
    const pending: ViewInfo = {
      id: 'draft',
      status: 'draft',
      title: 'Draft view',
      requirements: ''
    }
    const rows = assembleTabRows([...views, pending], 'views/draft')
    expect(rows.find(row => row.id === 'views/draft')).toMatchObject({
      title: 'Draft view',
      isDefault: true,
      href: 'moi:/views/draft'
    })
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
