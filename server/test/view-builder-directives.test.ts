import { describe, expect, test } from 'bun:test'

import { renderMoiContext } from '@/lib/moi-context'
import { viewBuilderDirectives } from '@/lib/view-builder-directives'

describe('view builder directives', () => {
  test('render into the moi-context envelope with the agent instructions', () => {
    const context = renderMoiContext({
      activeTab: 'view-builder:builder-123',
      directives: viewBuilderDirectives('builder-123', ['chart', 'calendar'])
    })
    expect(context).toContain('The user is building a new view. Builder id "builder-123".')
    expect(context).toContain('# This message only\nView builder request')
    expect(context).toContain('Builder id: builder-123')
    expect(context).toContain('Available view icons: chart, calendar')
    expect(context).toContain('Your first action must be')
    expect(context).toContain('sentence-case title')
    expect(context).toContain('Capitalize only the first word')
    expect(context).toContain('moi builder set <view-id> --builder builder-123 --kind view')
    expect(context).toContain('--icon <icon-id>')
    expect(context).toContain('before reading files')
  })
})
