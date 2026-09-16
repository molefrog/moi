import { describe, expect, test } from 'bun:test'

import type { ViewInfo } from '@/lib/types'

import { assembleTabRows, resolveNavigation } from './tabs'

const views: ViewInfo[] = [
  { id: 'roadmap', config: { title: 'Roadmap' } },
  { id: 'orders', config: { title: '' } }
]

describe('assembleTabRows', () => {
  test('lists static tabs then views, marking the saved default', () => {
    const rows = assembleTabRows(views, 'view:roadmap')
    expect(rows.map(r => r.id)).toEqual([
      'overview',
      'agent',
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

describe('resolveNavigation', () => {
  const deps = { hasView: (id: string) => Promise.resolve(id === 'roadmap') }
  test('accepts current public destinations and canonicalizes query params', async () => {
    expect(await resolveNavigation('moi:/overview', deps)).toEqual({
      ok: true,
      href: 'moi:/overview'
    })
    expect(await resolveNavigation('moi:/scratchpad', deps)).toEqual({
      ok: true,
      href: 'moi:/scratchpad'
    })
    expect(await resolveNavigation('moi:/views/roadmap?z=1&a=2', deps)).toEqual({
      ok: true,
      href: 'moi:/views/roadmap?a=2&z=1'
    })
  })
  test('rejects missing views, old tab IDs, private and future destinations', async () => {
    for (const href of [
      'moi:/views/missing',
      'view:roadmap',
      'moi:/agent',
      'moi:/view-builders/abc',
      'moi:/chats/abc',
      'moi:/files/a.txt',
      '',
      undefined
    ]) {
      expect((await resolveNavigation(href, deps)).ok).toBe(false)
    }
  })
  test('discovery includes portable links but no singleton chat contract', () => {
    const rows = assembleTabRows(views, 'overview')
    expect(rows.find(row => row.id === 'view:orders')?.href).toBe('moi:/views/orders')
    expect(rows.find(row => row.id === 'agent')?.href).toBeUndefined()
  })
})
