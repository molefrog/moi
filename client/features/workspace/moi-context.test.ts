import { describe, expect, test } from 'bun:test'

import {
  activeTabTitle,
  drainChatDirectives,
  drainIntentAction,
  pushChatDirective,
  pushIntentAction
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

  test('intent actions queue per workspace, last write wins, drain once', () => {
    pushIntentAction('ws-1', { source: 'widget:products', context: { sku: 'old' } })
    pushIntentAction('ws-1', { source: 'widget:products', context: { sku: 'a-1' } })
    pushIntentAction('ws-2', { source: 'view:crm' })
    expect(drainIntentAction('ws-1')).toEqual({
      source: 'widget:products',
      context: { sku: 'a-1' }
    })
    expect(drainIntentAction('ws-1')).toBeUndefined()
    expect(drainIntentAction('ws-2')).toEqual({ source: 'view:crm' })
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
