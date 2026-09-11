import { describe, expect, test } from 'bun:test'

import {
  appletKey,
  invalidateApplet,
  invalidateAppletSegment,
  setCachedApplet
} from './applet-cache'
import {
  type AppletBridge,
  type AppletChatMessage,
  type AppletIdentity,
  appletRuntime,
  attachAppletBridge,
  disposeAppletBridge
} from './applet-runtime'

// The runtime is the trust boundary between agent-authored applet bundles and
// the host: every bridge call arrives with `unknown` args and must be narrowed
// before it's emitted to subscribers, and a disposed bridge (stale module
// after a rebuild) must never act again.

const VIEW: AppletIdentity = { kind: 'view', name: 'board' }
const WIDGET: AppletIdentity = { kind: 'widget', name: 'clock' }

function subscribeFocus(workspaceId: string) {
  const calls: [string, Record<string, unknown> | undefined][] = []
  const unbind = appletRuntime(workspaceId).on('focusTab', (tab, params) =>
    calls.push([tab, params])
  )
  return { calls, unbind }
}

function subscribeChat(workspaceId: string) {
  const calls: AppletChatMessage[] = []
  const unbind = appletRuntime(workspaceId).on('sendChatMessage', message => calls.push(message))
  return { calls, unbind }
}

describe('bridge validation', () => {
  test('emits a well-formed call and narrows malformed params to undefined', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeFocus(ws)
    const { bridge } = appletRuntime(ws).connect(VIEW)

    bridge.focusTab('view:orders', { order: 'o-1' })
    bridge.focusTab('overview')
    // Valid JSON, wrong shape — params must degrade, not leak through.
    bridge.focusTab('view:orders', ['not', 'a', 'record'])
    bridge.focusTab('view:orders', null)

    expect(calls).toEqual([
      ['view:orders', { order: 'o-1' }],
      ['overview', undefined],
      ['view:orders', undefined],
      ['view:orders', undefined]
    ])
  })

  test('drops calls with a malformed tab id instead of emitting', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeFocus(ws)
    const { bridge } = appletRuntime(ws).connect(VIEW)

    bridge.focusTab('not-a-tab')
    bridge.focusTab('view:multi/segment')
    bridge.focusTab(42)
    bridge.focusTab({ toString: () => 'agent' })

    expect(calls).toEqual([])
  })

  test('emitting with no subscribers (screen unmounted) is a no-op', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { bridge } = appletRuntime(ws).connect(VIEW)
    expect(() => bridge.focusTab('agent')).not.toThrow()
  })

  test('an unbound subscriber stops receiving; others keep receiving', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const first = subscribeFocus(ws)
    const second = subscribeFocus(ws)
    const { bridge } = appletRuntime(ws).connect(VIEW)

    bridge.focusTab('agent')
    first.unbind()
    bridge.focusTab('overview')

    expect(first.calls).toEqual([['agent', undefined]])
    expect(second.calls).toEqual([
      ['agent', undefined],
      ['overview', undefined]
    ])
  })
})

describe('sendChatMessage validation', () => {
  test('trims the message and stamps the applet source the host attached', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(WIDGET)

    bridge.sendChatMessage('  Chase order A-1042  ', { order: 'A-1042' })

    expect(calls).toEqual([
      { message: 'Chase order A-1042', source: 'widget:clock', context: { order: 'A-1042' } }
    ])
  })

  test('drops a message that is empty, blank, or not a string', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(VIEW)

    bridge.sendChatMessage('')
    bridge.sendChatMessage('   ')
    bridge.sendChatMessage(42)
    bridge.sendChatMessage(null)
    bridge.sendChatMessage({ toString: () => 'Do a thing' })

    expect(calls).toEqual([])
  })

  test('drops a message too long to be a chat bubble', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(VIEW)

    bridge.sendChatMessage('x'.repeat(1001))

    expect(calls).toEqual([])
  })

  test('keeps the message but drops a context that cannot ride the envelope', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(VIEW)

    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    bridge.sendChatMessage('array context', ['not', 'a', 'record'])
    bridge.sendChatMessage('cyclic context', cyclic)
    bridge.sendChatMessage('huge context', { blob: 'x'.repeat(2001) })

    // The message carries the user's intent, so a bad payload must not lose it.
    expect(calls.map(c => [c.message, c.context])).toEqual([
      ['array context', undefined],
      ['cyclic context', undefined],
      ['huge context', undefined]
    ])
  })

  test('an applet cannot send through a disposed bridge', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge, dispose } = appletRuntime(ws).connect(VIEW)

    bridge.sendChatMessage('before')
    dispose()
    bridge.sendChatMessage('after')

    expect(calls.map(c => c.message)).toEqual(['before'])
  })
})

describe('sendChatMessage rate limiting', () => {
  // Every send starts an agent run, so the runtime — not the applet — is
  // responsible for what a render loop or a double-mounted bundle can spend.
  test('collapses an identical message repeated inside the cooldown', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(WIDGET)

    bridge.sendChatMessage('Sync now')
    bridge.sendChatMessage('Sync now')
    bridge.sendChatMessage('Sync now')

    expect(calls.map(c => c.message)).toEqual(['Sync now'])
  })

  test('the cooldown is per applet and message, not a global mute', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const widget = appletRuntime(ws).connect(WIDGET)
    const view = appletRuntime(ws).connect(VIEW)

    widget.bridge.sendChatMessage('Sync now')
    // Same text, different applet — a real second message.
    view.bridge.sendChatMessage('Sync now')
    widget.bridge.sendChatMessage('Something else')

    expect(calls.map(c => [c.source, c.message])).toEqual([
      ['widget:clock', 'Sync now'],
      ['view:board', 'Sync now'],
      ['widget:clock', 'Something else']
    ])
  })

  test('caps a loop that varies its message every call', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(WIDGET)

    for (let i = 0; i < 25; i++) bridge.sendChatMessage(`message ${i}`)

    expect(calls).toHaveLength(10)
  })

  test('the cap is per workspace, so one runaway applet cannot mute another workspace', () => {
    const wsA = `ws-${crypto.randomUUID()}`
    const wsB = `ws-${crypto.randomUUID()}`
    const a = subscribeChat(wsA)
    const b = subscribeChat(wsB)

    for (let i = 0; i < 25; i++) {
      appletRuntime(wsA).connect(WIDGET).bridge.sendChatMessage(`a ${i}`)
    }
    appletRuntime(wsB).connect(WIDGET).bridge.sendChatMessage('b 0')

    expect(a.calls).toHaveLength(10)
    expect(b.calls.map(c => c.message)).toEqual(['b 0'])
  })
})

describe('disposal', () => {
  test('a disposed connection is inert even while subscribers are live', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeFocus(ws)

    const { bridge, dispose } = appletRuntime(ws).connect(VIEW)
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
    attachAppletBridge(mod, ws, appletKey('views', ws, 'board'), VIEW)
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
    attachAppletBridge(mod, ws, key, WIDGET)
    invalidateAppletSegment('widgets')
    mod.focusTab('overview')
    expect(calls).toEqual([])
  })

  test('no-ops on a bundle without the bridge exports (built before this change)', () => {
    const ws = `ws-${crypto.randomUUID()}`
    expect(() => attachAppletBridge({ default: () => null }, ws, 'views/x/y', VIEW)).not.toThrow()
    expect(() => disposeAppletBridge('views/x/y')).not.toThrow()
  })

  test('re-attaching under a key disposes the previous connection', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeFocus(ws)
    const key = appletKey('views', ws, 'board')

    const oldMod = fakeModule()
    attachAppletBridge(oldMod, ws, key, VIEW)
    const newMod = fakeModule()
    attachAppletBridge(newMod, ws, key, VIEW)

    oldMod.focusTab('agent')
    newMod.focusTab('overview')
    expect(calls).toEqual([['overview', undefined]])
  })
})

describe('workspace isolation', () => {
  test('bridges reach only their own workspace runtime', () => {
    const wsA = `ws-${crypto.randomUUID()}`
    const wsB = `ws-${crypto.randomUUID()}`
    const a = subscribeFocus(wsA)
    const b = subscribeFocus(wsB)

    appletRuntime(wsA).connect(VIEW).bridge.focusTab('agent')
    expect(a.calls).toEqual([['agent', undefined]])
    expect(b.calls).toEqual([])
  })
})
