import { expect, spyOn, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Route, Router } from 'wouter'

import type { ViewInfo } from '@/lib/types'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import * as workspaceEvents from '@/client/runtime/useWorkspaceEvents'
import { WorkspaceLayoutContext } from './WorkspaceLayoutContext'
import { useWorkspaceNavigation } from './useWorkspaceNavigation'

function readNavigation(
  path: string,
  search: string,
  views: ViewInfo[],
  base = '',
  navigate?: (path: string) => void
) {
  const prefix = base === '/' ? '' : base
  function Probe() {
    const { activeTab, appletParams, isUnavailable } = useWorkspaceNavigation({
      views,
      split: false
    })
    return (
      <script type="application/json">
        {JSON.stringify({ activeTab, appletParams, isUnavailable })}
      </script>
    )
  }
  const html = renderToStaticMarkup(
    <Router
      base={base}
      ssrPath={`${prefix}/workspace/abc/${path}`}
      ssrSearch={search}
      hook={navigate ? () => [`${prefix}/workspace/abc/${path}`, navigate] : undefined}
    >
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
    { id: 'events', status: 'compiled', title: 'events' }
  ])
  expect(result.appletParams).toEqual(params)
})

test('encoded IDs resolve under a deployment base without decoding nested escapes', () => {
  const views: ViewInfo[] = [{ id: 'events', status: 'compiled', title: 'events' }]
  expect(readNavigation('views/%65vents', '', views, '/prefix').activeTab).toBe('views/events')
  expect(readNavigation('views/%2565vents', '', views, '/prefix').isUnavailable).toBe(true)
})

test('missing views keep their destination without becoming the default tab', () => {
  const result = readNavigation('views/missing', '?eventId=123', [])
  expect(result.activeTab).toBe('views/missing')
  expect(result.isUnavailable).toBe(true)
  expect(result.appletParams).toEqual({ eventId: '123' })
})

test('legacy browser paths select the same view under a deployment base', () => {
  const views: ViewInfo[] = [{ id: 'events', status: 'compiled', title: 'events' }]
  const result = readNavigation('view:%65vents', 'eventId=123', views, '/prefix')
  expect(result.activeTab).toBe('views/events')
  expect(result.isUnavailable).toBe(false)
  expect(result.appletParams).toEqual({ eventId: '123' })
  expect(readNavigation('view:%2565vents', '', views).isUnavailable).toBe(true)
})

test.each(['', '/', '/prefix'])(
  'the navigation controller routes pages and files with router base "%s"',
  base => {
    const prefix = base === '/' ? '' : base
    const nativePaths: string[] = []
    const routedPaths: string[] = []
    let navigate = (_path: string): void => {
      throw new Error('Navigation controller was not registered')
    }
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          pathname: `${prefix}/workspace/abc/overview`,
          search: '',
          hash: '',
          assign: (path: string) => nativePaths.push(path)
        }
      }
    })
    const registration = spyOn(workspaceEvents, 'useNavigationClient').mockImplementation(
      (_workspaceId, callback) => {
        navigate = callback
      }
    )
    try {
      readNavigation(
        'overview',
        '',
        [{ id: 'orders', status: 'compiled', title: 'Orders' }],
        base,
        path => {
          routedPaths.push(path)
        }
      )
      navigate('moi:/views/orders?order=o-1')
      navigate('moi:/files/clips/a%20b.mp4?version=2#t=5')
      navigate('https://example.com/')
      expect(routedPaths).toEqual([`${prefix}/workspace/abc/views/orders?order=o-1`])
      expect(nativePaths).toEqual([
        '/api/workspaces/abc/files/clips/a%20b.mp4?version=2#t=5',
        'https://example.com/'
      ])
      expect(() => navigate('moi:/views/missing')).toThrow('unavailable')
      expect(() => navigate('moi:/files/../photo.png')).toThrow()
      expect(() => navigate('javascript:alert(1)')).toThrow()
      expect(routedPaths).toHaveLength(1)
      expect(nativePaths).toHaveLength(2)
    } finally {
      registration.mockRestore()
      if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor)
      else Reflect.deleteProperty(globalThis, 'window')
    }
  }
)
