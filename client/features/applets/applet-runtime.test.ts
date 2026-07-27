import { describe, expect, test } from 'bun:test'

import {
  appletKey,
  invalidateApplet,
  invalidateAppletSegment,
  setCachedApplet
} from './applet-cache'
import {
  type AppletBridge,
  appletRuntime,
  attachAppletBridge,
  disposeAppletBridge
} from './applet-runtime'

// The runtime is the trust boundary between agent-authored applet bundles and
// the host: every bridge call arrives with `unknown` args and must be narrowed
// before it's emitted to subscribers, and a disposed bridge (stale module
// after a rebuild) must never act again.

function subscribeFocus(workspaceId: string) {
  const calls: [string, Record<string, unknown> | undefined][] = []
  const unbind = appletRuntime(workspaceId).on('focusTab', (tab, params) =>
    calls.push([tab, params])
  )
  return { calls, unbind }
}

describe('bridge validation', () => {
  test('emits a well-formed call and narrows malformed params to undefined', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeFocus(ws)
    const { bridge } = appletRuntime(ws).connect()

    bridge.focusTab('view:orders', { order: 'o-1' })
    bridge.focusTab('widgets')
    // Valid JSON, wrong shape — params must degrade, not leak through.
    bridge.focusTab('view:orders', ['not', 'a', 'record'])
    bridge.focusTab('view:orders', null)

    expect(calls).toEqual([
      ['view:orders', { order: 'o-1' }],
      ['widgets', undefined],
      ['view:orders', undefined],
      ['view:orders', undefined]
    ])
  })

  test('drops calls with a malformed tab id instead of emitting', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeFocus(ws)
    const { bridge } = appletRuntime(ws).connect()

    bridge.focusTab('not-a-tab')
    bridge.focusTab('view:multi/segment')
    bridge.focusTab(42)
    bridge.focusTab({ toString: () => 'agent' })

    expect(calls).toEqual([])
  })

  test('emitting with no subscribers (screen unmounted) is a no-op', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { bridge } = appletRuntime(ws).connect()
    expect(() => bridge.focusTab('agent')).not.toThrow()
  })

  test('an unbound subscriber stops receiving; others keep receiving', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const first = subscribeFocus(ws)
    const second = subscribeFocus(ws)
    const { bridge } = appletRuntime(ws).connect()

    bridge.focusTab('agent')
    first.unbind()
    bridge.focusTab('widgets')

    expect(first.calls).toEqual([['agent', undefined]])
    expect(second.calls).toEqual([
      ['agent', undefined],
      ['widgets', undefined]
    ])
  })
})

describe('disposal', () => {
  test('a disposed connection is inert even while subscribers are live', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeFocus(ws)

    const { bridge, dispose } = appletRuntime(ws).connect()
    bridge.focusTab('agent')
    dispose()
    bridge.focusTab('agent')
    expect(calls).toEqual([['agent', undefined]])
  })
})

// A stand-in for a loaded bundle's module namespace: the entry re-exports
// `__attachBridge` (see server/bundler/build-applet.ts).
function fakeModule() {
  let bridge: AppletBridge | null = null
  return {
    __attachBridge: (next: AppletBridge) => {
      bridge = next
    },
    focusTab: (tab: unknown, params?: unknown) => bridge?.focusTab(tab, params)
  }
}

describe('attachAppletBridge', () => {
  test('wires a module to its workspace runtime; invalidateApplet neuters it', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeFocus(ws)

    const mod = fakeModule()
    attachAppletBridge(mod, ws, appletKey('views', ws, 'board'))
    mod.focusTab('view:board')
    expect(calls).toEqual([['view:board', undefined]])

    // The rebuild path: invalidation must leave the OLD module instance inert.
    invalidateApplet('views', ws, 'board')
    mod.focusTab('view:board')
    expect(calls).toEqual([['view:board', undefined]])
  })

  test('invalidateAppletSegment disposes bridges kind-wide', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeFocus(ws)

    const mod = fakeModule()
    const key = appletKey('widgets', ws, 'clock')
    // The load path caches the module before attaching (useApplet), and the
    // segment sweep walks cached keys — mirror that order here.
    setCachedApplet(key, Promise.resolve(mod))
    attachAppletBridge(mod, ws, key)
    invalidateAppletSegment('widgets')
    mod.focusTab('widgets')
    expect(calls).toEqual([])
  })

  test('no-ops on a bundle without the bridge exports (built before this change)', () => {
    const ws = `ws-${crypto.randomUUID()}`
    expect(() => attachAppletBridge({ default: () => null }, ws, 'views/x/y')).not.toThrow()
    expect(() => disposeAppletBridge('views/x/y')).not.toThrow()
  })

  test('re-attaching under a key disposes the previous connection', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeFocus(ws)
    const key = appletKey('views', ws, 'board')

    const oldMod = fakeModule()
    attachAppletBridge(oldMod, ws, key)
    const newMod = fakeModule()
    attachAppletBridge(newMod, ws, key)

    oldMod.focusTab('agent')
    newMod.focusTab('widgets')
    expect(calls).toEqual([['widgets', undefined]])
  })
})

describe('workspace isolation', () => {
  test('bridges reach only their own workspace runtime', () => {
    const wsA = `ws-${crypto.randomUUID()}`
    const wsB = `ws-${crypto.randomUUID()}`
    const a = subscribeFocus(wsA)
    const b = subscribeFocus(wsB)

    appletRuntime(wsA).connect().bridge.focusTab('agent')
    expect(a.calls).toEqual([['agent', undefined]])
    expect(b.calls).toEqual([])
  })
})
