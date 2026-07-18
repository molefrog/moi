import { describe, expect, test } from 'bun:test'

import { matchBundleUrl } from './applet-log'

const WS = '17c35e98-f9a0-4cc3-bb71-cd8c279edb9b'

describe('matchBundleUrl', () => {
  test('matches a bare bundle URL (ErrorEvent.filename)', () => {
    expect(
      matchBundleUrl(`http://localhost:13337/api/workspaces/${WS}/widgets/hello/index.js`)
    ).toEqual({ workspaceId: WS, kind: 'widget', name: 'hello' })
  })

  test('matches a cache-busted view chunk URL', () => {
    expect(
      matchBundleUrl(`http://localhost:13337/api/workspaces/${WS}/views/crm/chunk-ab12.js?v=3`)
    ).toEqual({ workspaceId: WS, kind: 'view', name: 'crm' })
  })

  test('matches inside a Chrome-style stack frame (parenthesized URL)', () => {
    const stack = [
      'TypeError: boom',
      `    at onClick (http://localhost:13337/api/workspaces/${WS}/widgets/rps-chart/index.js:10:5)`,
      '    at invokeGuardedCallback (http://localhost:13337/vendor/react/react-dom.js:4:2)'
    ].join('\n')
    expect(matchBundleUrl(stack)).toEqual({ workspaceId: WS, kind: 'widget', name: 'rps-chart' })
  })

  test('matches inside a Firefox-style stack frame (fn@url)', () => {
    const stack = `onClick@http://localhost:13337/api/workspaces/${WS}/views/crm/index.js:10:5`
    expect(matchBundleUrl(stack)).toEqual({ workspaceId: WS, kind: 'view', name: 'crm' })
  })

  test('does not match host-app or vendor URLs', () => {
    expect(matchBundleUrl('at fn (http://localhost:13337/vendor/react/react.js:1:1)')).toBeNull()
    expect(
      matchBundleUrl(`at fn (http://localhost:13337/api/workspaces/${WS}/rpc/widgets/hello/f)`)
    ).toBeNull()
  })

  test('does not match empty or stack-less input', () => {
    expect(matchBundleUrl(undefined)).toBeNull()
    expect(matchBundleUrl('')).toBeNull()
    expect(matchBundleUrl('TypeError: boom')).toBeNull()
  })
})
