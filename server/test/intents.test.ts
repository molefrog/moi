import { describe, expect, test } from 'bun:test'

import { INTENT_NAME_RE, collectIntents, intentNames, resolveIntentView } from '@/lib/intents'
import type { ViewInfo } from '@/lib/types'

const views: ViewInfo[] = [
  {
    id: 'crm',
    config: {
      title: 'CRM',
      intents: [
        { name: 'open-customer', description: 'Open one customer', params: { id: 'customer id' } },
        { name: 'search' }
      ]
    }
  },
  { id: 'notes', config: { title: 'Notes' } },
  {
    id: 'orders',
    config: {
      title: 'Orders',
      // `search` is also declared by crm — dispatch resolves to crm (first).
      intents: [{ name: 'search' }, { name: 'open-order' }]
    }
  }
]

describe('collectIntents (the capability manifest)', () => {
  test('flattens every declaration in view order, tagged with its view', () => {
    expect(collectIntents(views)).toEqual([
      {
        name: 'open-customer',
        description: 'Open one customer',
        params: { id: 'customer id' },
        viewId: 'crm'
      },
      { name: 'search', viewId: 'crm' },
      { name: 'search', viewId: 'orders' },
      { name: 'open-order', viewId: 'orders' }
    ])
  })

  test('empty when no view declares anything', () => {
    expect(collectIntents([{ id: 'plain', config: {} }])).toEqual([])
  })
})

describe('intentNames (envelope surface)', () => {
  test('dedupes names in declaration order', () => {
    expect(intentNames(views)).toEqual(['open-customer', 'search', 'open-order'])
  })
})

describe('resolveIntentView (routing)', () => {
  test('resolves to the first view declaring the name', () => {
    expect(resolveIntentView(views, 'open-order')?.id).toBe('orders')
    expect(resolveIntentView(views, 'search')?.id).toBe('crm')
  })

  test('unresolved names return null', () => {
    expect(resolveIntentView(views, 'close-ticket')).toBeNull()
    expect(resolveIntentView([], 'open-customer')).toBeNull()
  })
})

describe('INTENT_NAME_RE', () => {
  test('accepts kebab-case verbs, rejects everything else', () => {
    expect(INTENT_NAME_RE.test('open-product')).toBe(true)
    expect(INTENT_NAME_RE.test('sync')).toBe(true)
    expect(INTENT_NAME_RE.test('v2-sync-all')).toBe(true)
    expect(INTENT_NAME_RE.test('Open-Product')).toBe(false)
    expect(INTENT_NAME_RE.test('open_product')).toBe(false)
    expect(INTENT_NAME_RE.test('open product')).toBe(false)
    expect(INTENT_NAME_RE.test('-open')).toBe(false)
    expect(INTENT_NAME_RE.test('')).toBe(false)
  })
})
