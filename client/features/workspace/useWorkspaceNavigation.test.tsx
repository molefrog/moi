import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Route, Router } from 'wouter'

import type { ViewInfo } from '@/lib/types'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import { WorkspaceLayoutContext } from './WorkspaceLayoutContext'
import { useWorkspaceNavigation } from './useWorkspaceNavigation'

function readNavigation(path: string, search: string, views: ViewInfo[], base = '') {
  function Probe() {
    const { activeTab, appletParams, isUnavailable } = useWorkspaceNavigation({
      views,
      builders: [],
      split: false
    })
    return (
      <script type="application/json">
        {JSON.stringify({ activeTab, appletParams, isUnavailable })}
      </script>
    )
  }
  const html = renderToStaticMarkup(
    <Router base={base} ssrPath={`${base}/workspace/abc/${path}`} ssrSearch={search}>
      <Route path="/workspace/:id/*?">
        <WorkspaceLayoutContext
          value={{
            layout: createDefaultWorkspaceLayout(),
            setLayout: () => {},
            name: null,
            cwd: null,
            provider: null,
            workspaceId: 'abc',
            isLoading: false
          }}
        >
          <Probe />
        </WorkspaceLayoutContext>
      </Route>
    </Router>
  )
  if (!html) throw new Error('The workspace route did not match')
  return JSON.parse(html.slice(html.indexOf('>') + 1, html.lastIndexOf('<'))) as Pick<
    ReturnType<typeof useWorkspaceNavigation>,
    'activeTab' | 'appletParams' | 'isUnavailable'
  >
}

test('view params decode exactly once through the real router', () => {
  const params = { literal: '%20 %26 %2F', json: '{"value":"100%"}', plus: '+' }
  const result = readNavigation('views/events', new URLSearchParams(params).toString(), [
    { id: 'events', config: {} }
  ])
  expect(result.appletParams).toEqual(params)
})

test('encoded IDs resolve under a deployment base without decoding nested escapes', () => {
  const views = [{ id: 'events', config: {} }]
  expect(readNavigation('views/%65vents', '', views, '/prefix').activeTab).toBe('view:events')
  expect(readNavigation('views/%2565vents', '', views, '/prefix').isUnavailable).toBe(true)
})

test('missing views keep their destination without becoming the default tab', () => {
  const result = readNavigation('views/missing', '?eventId=123', [])
  expect(result.activeTab).toBe('view:missing')
  expect(result.isUnavailable).toBe(true)
  expect(result.appletParams).toEqual({ eventId: '123' })
})
