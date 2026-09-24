import { describe, expect, test } from 'bun:test'

import { renderMoiContext } from '@/lib/moi-context'
import { viewBuildDirectives } from '@/lib/view-build-directives'

describe('view build directives', () => {
  test('supply view-specific context without repeating the build workflow', () => {
    const context = renderMoiContext({
      activeTab: 'views/garden',
      directives: viewBuildDirectives('garden', ['chart', 'calendar'])
    })
    expect(context).toContain('The user is on the "garden" view tab')
    expect(context).toContain('# This message only\nView build request')
    expect(context).toContain('pending view steps in the moi-workspace skill')
    expect(context).toContain('View id: garden')
    expect(context).toContain('Available view icons: chart, calendar')
    expect(context).toContain('moi views set garden --title "<title>" --icon <icon-id>')
    expect(context).toContain('Link to moi:/views/garden')
    expect(context).not.toContain('moi check')
    expect(context).not.toContain('moi bundle')
  })
})
