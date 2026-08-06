import { describe, expect, test } from 'bun:test'

import {
  MAX_RESIDENT_VIEWS,
  nextEvictionDelay,
  reconcileResidents,
  type ResidentView,
  sameResidents,
  VIEW_RETENTION_MS
} from '@/client/features/views/view-residency'

const availability = (...ids: string[]) => new Set(ids)

describe('reconcileResidents', () => {
  test('adds the active view at the front', () => {
    const residents = reconcileResidents([], {
      activeId: 'orders',
      available: availability('orders'),
      now: 1000
    })

    expect(residents).toEqual([{ id: 'orders', releasedAt: null }])
  })

  test('parks the view the active one replaced', () => {
    const first = reconcileResidents([], {
      activeId: 'orders',
      available: availability('orders', 'inbox'),
      now: 1000
    })
    const second = reconcileResidents(first, {
      activeId: 'inbox',
      available: availability('orders', 'inbox'),
      now: 2000
    })

    expect(second).toEqual([
      { id: 'inbox', releasedAt: null },
      { id: 'orders', releasedAt: 2000 }
    ])
  })

  test('keeps the release clock running instead of restarting it', () => {
    const parked: ResidentView[] = [
      { id: 'inbox', releasedAt: null },
      { id: 'orders', releasedAt: 2000 }
    ]

    const residents = reconcileResidents(parked, {
      activeId: 'inbox',
      available: availability('orders', 'inbox'),
      now: 5000
    })

    expect(residents[1]).toEqual({ id: 'orders', releasedAt: 2000 })
  })

  test('evicts a parked view once the retention window passes', () => {
    const parked: ResidentView[] = [
      { id: 'inbox', releasedAt: null },
      { id: 'orders', releasedAt: 2000 }
    ]

    const inside = reconcileResidents(parked, {
      activeId: 'inbox',
      available: availability('orders', 'inbox'),
      now: 2000 + VIEW_RETENTION_MS - 1
    })
    const outside = reconcileResidents(parked, {
      activeId: 'inbox',
      available: availability('orders', 'inbox'),
      now: 2000 + VIEW_RETENTION_MS
    })

    expect(inside.map(resident => resident.id)).toEqual(['inbox', 'orders'])
    expect(outside.map(resident => resident.id)).toEqual(['inbox'])
  })

  test('releases every resident when a non-view tab is on screen', () => {
    const residents = reconcileResidents([{ id: 'orders', releasedAt: null }], {
      activeId: null,
      available: availability('orders'),
      now: 3000
    })

    expect(residents).toEqual([{ id: 'orders', releasedAt: 3000 }])
  })

  test('re-promoting a parked view clears its deadline', () => {
    const residents = reconcileResidents([{ id: 'orders', releasedAt: 3000 }], {
      activeId: 'orders',
      available: availability('orders'),
      now: 4000
    })

    expect(residents).toEqual([{ id: 'orders', releasedAt: null }])
  })

  test('drops a view that no longer exists', () => {
    const residents = reconcileResidents(
      [
        { id: 'inbox', releasedAt: null },
        { id: 'orders', releasedAt: 2000 }
      ],
      { activeId: 'inbox', available: availability('inbox'), now: 2500 }
    )

    expect(residents).toEqual([{ id: 'inbox', releasedAt: null }])
  })

  test('ignores an active view that does not exist', () => {
    const residents = reconcileResidents([], {
      activeId: 'deleted',
      available: availability('orders'),
      now: 1000
    })

    expect(residents).toEqual([])
  })

  test('caps the resident set, dropping the coldest view first', () => {
    const parked: ResidentView[] = Array.from({ length: MAX_RESIDENT_VIEWS + 2 }, (_, index) => ({
      id: `view-${index}`,
      releasedAt: 1000
    }))

    const residents = reconcileResidents(parked, {
      activeId: 'fresh',
      available: availability('fresh', ...parked.map(resident => resident.id)),
      now: 1500
    })

    expect(residents).toHaveLength(MAX_RESIDENT_VIEWS)
    expect(residents.map(resident => resident.id)).toEqual([
      'fresh',
      ...parked.slice(0, MAX_RESIDENT_VIEWS - 1).map(resident => resident.id)
    ])
  })
})

describe('nextEvictionDelay', () => {
  test('is null while nothing is on the clock', () => {
    expect(nextEvictionDelay([{ id: 'orders', releasedAt: null }], 1000)).toBeNull()
  })

  test('reports the nearest deadline', () => {
    const delay = nextEvictionDelay(
      [
        { id: 'inbox', releasedAt: null },
        { id: 'orders', releasedAt: 2000 },
        { id: 'reports', releasedAt: 1000 }
      ],
      3000
    )

    expect(delay).toBe(VIEW_RETENTION_MS - 2000)
  })

  test('never goes negative for an overdue view', () => {
    expect(nextEvictionDelay([{ id: 'orders', releasedAt: 0 }], VIEW_RETENTION_MS * 2)).toBe(0)
  })
})

describe('sameResidents', () => {
  test('compares ids and deadlines in order', () => {
    const residents: ResidentView[] = [
      { id: 'inbox', releasedAt: null },
      { id: 'orders', releasedAt: 2000 }
    ]

    expect(sameResidents(residents, [...residents])).toBe(true)
    expect(sameResidents(residents, [residents[1], residents[0]])).toBe(false)
    expect(sameResidents(residents, [residents[0]])).toBe(false)
    expect(sameResidents(residents, [residents[0], { id: 'orders', releasedAt: 2001 }])).toBe(false)
  })
})
