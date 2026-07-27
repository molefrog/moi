import { describe, expect, test } from 'bun:test'

import {
  activeTabTitle,
  clearTabAddress,
  drainChatDirectives,
  publishTabAddress,
  pushChatDirective,
  tabAddressFields,
  takeChatDirectives
} from './moi-context'
import type { ViewBuilder, ViewInfo } from '@/lib/types'

describe('moi context assembly', () => {
  test('directives queue per workspace and drain once, in order', () => {
    pushChatDirective('ws-1', 'First.')
    pushChatDirective('ws-1', 'Second.')
    pushChatDirective('ws-2', 'Other workspace.')
    expect(drainChatDirectives('ws-1')).toEqual(['First.', 'Second.'])
    expect(drainChatDirectives('ws-1')).toEqual([])
    expect(drainChatDirectives('ws-2')).toEqual(['Other workspace.'])
  })

  test('appends directives tied to the current message after queued directives', () => {
    pushChatDirective('ws-3', 'Queued first.')

    expect(takeChatDirectives('ws-3', ['Inline second.', 'Inline third.'])).toEqual([
      'Queued first.',
      'Inline second.',
      'Inline third.'
    ])
    expect(takeChatDirectives('ws-3')).toEqual([])
  })

  test('activeTabTitle resolves view titles and claimed builder titles', () => {
    const views: ViewInfo[] = [
      { id: 'color-studio', config: { title: 'Grading review' } },
      { id: 'untitled', config: {} }
    ]
    const builders: ViewBuilder[] = [
      {
        id: 'b-42',
        status: 'building',
        input: { requirements: '' },
        sessionId: 's-1',
        title: 'Customer overview',
        createdAt: 0,
        updatedAt: 0
      },
      {
        id: 'b-draft',
        status: 'draft',
        input: { requirements: '' },
        sessionId: 's-2',
        createdAt: 0,
        updatedAt: 0
      }
    ]
    expect(activeTabTitle('view:color-studio', views, builders)).toBe('Grading review')
    expect(activeTabTitle('view:untitled', views, builders)).toBeUndefined()
    expect(activeTabTitle('view:missing', views, builders)).toBeUndefined()
    expect(activeTabTitle('view-builder:b-42', views, builders)).toBe('Customer overview')
    expect(activeTabTitle('view-builder:b-draft', views, builders)).toBeUndefined()
    expect(activeTabTitle('scratchpad', views, builders)).toBeUndefined()
    expect(activeTabTitle('view:color-studio', undefined, undefined)).toBeUndefined()
  })
})

describe('tab address', () => {
  test('falls back to the saved default until navigation publishes', () => {
    const ws = `ws-${crypto.randomUUID()}`
    expect(tabAddressFields(ws, 'widgets')).toEqual({ activeTab: 'widgets' })
  })

  test('a published address wins over the saved default', () => {
    const ws = `ws-${crypto.randomUUID()}`
    publishTabAddress(ws, 'view:orders', { order: 'A-1042' })
    expect(tabAddressFields(ws, 'widgets')).toEqual({
      activeTab: 'view:orders',
      tabParams: { order: 'A-1042' }
    })
  })

  test('only view tabs report params, and never an empty record', () => {
    const ws = `ws-${crypto.randomUUID()}`
    publishTabAddress(ws, 'view:orders', {})
    expect(tabAddressFields(ws, 'agent')).toEqual({ activeTab: 'view:orders' })
    // Widgets are not navigation targets, so params there mean nothing even if
    // history state somehow carries them.
    publishTabAddress(ws, 'widgets', { order: 'A-1042' })
    expect(tabAddressFields(ws, 'agent')).toEqual({ activeTab: 'widgets' })
  })

  test('addresses are per workspace and cleared on unmount', () => {
    const wsA = `ws-${crypto.randomUUID()}`
    const wsB = `ws-${crypto.randomUUID()}`
    publishTabAddress(wsA, 'view:orders', { order: 'A-1042' })
    expect(tabAddressFields(wsB, 'agent')).toEqual({ activeTab: 'agent' })
    clearTabAddress(wsA)
    expect(tabAddressFields(wsA, 'agent')).toEqual({ activeTab: 'agent' })
  })
})
