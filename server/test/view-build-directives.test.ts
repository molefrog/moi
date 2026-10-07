import { describe, expect, test } from 'bun:test'

import { renderMoiContext } from '@/lib/moi-context'
import { viewBuildDirectives } from '@/lib/view-build-directives'

describe('view build directives', () => {
  test('supply view-specific context without repeating the build workflow', () => {
    const context = renderMoiContext({
      activeTab: { id: 'views/garden' },
      directives: viewBuildDirectives('garden', ['chart', 'calendar'])
    })
    expect(context).toContain('The user is on the "garden" view tab')
    expect(context).toContain('# This message only\nBuild a new view from this message.')
    expect(context).toContain('pending view steps in the moi-workspace skill')
    expect(context).toContain('The view id is `garden`.')
    expect(context).toContain('`.moi/views/garden.tsx`')
    expect(context).toContain('Available view icons: chart, calendar')
    expect(context).toContain('moi views set garden --title "<title>" --icon <icon-id>')
    expect(context).toContain('moi views create --requirements "<complete requirements>"')
    expect(context).not.toContain('--from-session')
    expect(context).toContain('[Open the view](moi:/views/garden)')
    expect(context).not.toContain('moi check')
    expect(context).not.toContain('moi bundle')
  })
})
