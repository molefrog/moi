import { describe, expect, test } from 'bun:test'

import { activeViewTitle, drainChatDirectives, pushChatDirective } from './moi-context'
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

  test('activeViewTitle resolves only view tabs with a configured title', () => {
    const views: ViewInfo[] = [
      { id: 'color-studio', config: { title: 'Grading review' } },
      { id: 'untitled', config: {} }
    ]
    expect(activeViewTitle('view:color-studio', views)).toBe('Grading review')
    expect(activeViewTitle('view:untitled', views)).toBeUndefined()
    expect(activeViewTitle('view:missing', views)).toBeUndefined()
    expect(activeViewTitle('scratchpad', views)).toBeUndefined()
    expect(activeViewTitle('view:color-studio', undefined)).toBeUndefined()
  })
})
