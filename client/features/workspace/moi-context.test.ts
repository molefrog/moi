import { describe, expect, test } from 'bun:test'

import {
  activeTabTitle,
  drainChatDirectives,
  envelopeTabParams,
  pushChatDirective,
  takeChatDirectives
} from './moi-context'
import type { ViewInfo } from '@/lib/types'

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

  test('activeTabTitle resolves compiled and provisional view titles', () => {
    const views: ViewInfo[] = [
      { id: 'color-studio', status: 'compiled', title: 'Grading review' },
      {
        id: 'b-42',
        status: 'submitted',
        title: 'Customer overview',
        requirements: '',
        executionSessionId: 's-1'
      },
      {
        id: 'b-draft',
        status: 'draft',
        requirements: ''
      }
    ]
    expect(activeTabTitle('views/color-studio', views)).toBe('Grading review')
    expect(activeTabTitle('views/b-42', views)).toBe('Customer overview')
    expect(activeTabTitle('views/b-draft', views)).toBeUndefined()
    expect(activeTabTitle('views/missing', views)).toBeUndefined()
    expect(activeTabTitle('scratchpad', views)).toBeUndefined()
    expect(activeTabTitle('views/color-studio', undefined)).toBeUndefined()
  })
})

describe('envelopeTabParams', () => {
  const params = { order: 'A-1042' }

  test('a view reports what it is rendering with', () => {
    expect(envelopeTabParams('views/orders', params)).toEqual(params)
  })

  test('a view with nothing addressable reports nothing', () => {
    expect(envelopeTabParams('views/orders', {})).toBeUndefined()
  })

  test('tabs without addressable state report nothing, params or not', () => {
    // Widgets are not navigation targets, and the static tabs take no params —
    // so a stray record here means nothing and must not reach the envelope.
    expect(envelopeTabParams('overview', params)).toBeUndefined()
    expect(envelopeTabParams('scratchpad', params)).toBeUndefined()
  })
})
