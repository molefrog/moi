import * as appletLog from './applet-log'
import { describe, expect, test, spyOn } from 'bun:test'

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

function subscribeNavigation(workspaceId: string) {
  const calls: string[] = []
  const unbind = appletRuntime(workspaceId).on('navigate', href => calls.push(href))
  return { calls, unbind }
}

function subscribeChat(workspaceId: string) {
  const calls: AppletChatMessage[] = []
  const unbind = appletRuntime(workspaceId).on('sendChatMessage', message => calls.push(message))
  return { calls, unbind }
}

describe('bridge validation', () => {
  test('emits URL navigation and rejects malformed addresses', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeNavigation(ws)
    const { bridge } = appletRuntime(ws).connect(VIEW)
    const log = spyOn(appletLog, 'reportAppletError').mockImplementation(() => {})
    bridge.navigate('moi:/views/orders?order=o-1')
    bridge.navigate('moi:/overview')
    bridge.navigate(['invalid'])
    bridge.navigate('javascript:alert(1)')
    expect(calls).toEqual(['moi:/views/orders?order=o-1', 'moi:/overview'])
    expect(log).toHaveBeenCalledTimes(2)
    log.mockRestore()
  })

  test('resolves native anchor hrefs in the source workspace and disposes safely', () => {
    const { bridge, dispose } = appletRuntime('ws-1').connect(VIEW)
    expect(bridge.resolveHref('moi:/views/orders?order=o-1')).toBe(
      '/workspace/ws-1/views/orders?order=o-1'
    )
    expect(bridge.resolveHref('https://example.com/')).toBe('https://example.com/')
    expect(() => bridge.resolveHref('javascript:alert(1)')).toThrow()
    dispose()
    expect(bridge.resolveHref('moi:/overview')).toBe('')
  })

  test('resolves applet links with the host router base', () => {
    const { bridge } = appletRuntime('prefixed').connect(VIEW, '/prefix')
    expect(bridge.resolveHref('moi:/views/orders')).toBe('/prefix/workspace/prefixed/views/orders')
  })

  test('drops calls with malformed addresses instead of emitting', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeNavigation(ws)
    const { bridge } = appletRuntime(ws).connect(VIEW)

    bridge.navigate('not-a-tab')
    bridge.navigate('view:multi/segment')
    bridge.navigate(42)
    bridge.navigate({ toString: () => 'moi:/scratchpad' })

    expect(calls).toEqual([])
  })

  test('emitting with no subscribers (screen unmounted) is a no-op', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { bridge } = appletRuntime(ws).connect(VIEW)
    expect(() => bridge.navigate('moi:/scratchpad')).not.toThrow()
  })

  test('an unbound subscriber stops receiving; others keep receiving', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const first = subscribeNavigation(ws)
    const second = subscribeNavigation(ws)
    const { bridge } = appletRuntime(ws).connect(VIEW)

    bridge.navigate('moi:/scratchpad')
    first.unbind()
    bridge.navigate('moi:/overview')

    expect(first.calls).toEqual(['moi:/scratchpad'])
    expect(second.calls).toEqual(['moi:/scratchpad', 'moi:/overview'])
  })
})

describe('sendChatMessage validation', () => {
  test('trims the message and stamps the applet source the host attached', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(WIDGET)

    bridge.sendChatMessage({
      message: '  Chase order A-1042  ',
      attachments: [{ type: 'text', label: 'Order', text: 'A-1042', source: 'forged' }]
    })

    expect(calls).toEqual([
      {
        message: 'Chase order A-1042',
        source: 'widget:clock',
        attachments: [{ type: 'text', label: 'Order', text: 'A-1042', source: 'widget:clock' }]
      }
    ])
  })

  test('normalizes legacy calls through the same validation and rate limiter', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(WIDGET)

    bridge.sendChatMessage('  Legacy  ', { order: '1042' })
    bridge.sendChatMessage({ message: 'Legacy', attachments: [] })
    bridge.sendChatMessage('Message only')
    bridge.sendChatMessage('Array context', [])
    bridge.sendChatMessage('x'.repeat(1001))
    bridge.sendChatMessage({ message: 'Object' }, { ignored: true })

    expect(calls).toEqual([
      {
        message: 'Legacy',
        source: 'widget:clock',
        attachments: [
          { type: 'text', label: 'Context', text: '{"order":"1042"}', source: 'widget:clock' }
        ]
      },
      { message: 'Message only', source: 'widget:clock', attachments: [] },
      {
        message: 'Array context',
        source: 'widget:clock',
        attachments: [{ type: 'text', label: 'Context', text: '[]', source: 'widget:clock' }]
      },
      { message: 'Object', source: 'widget:clock', attachments: [] }
    ])
  })

  test('drops a message that is empty, blank, or not a string', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(VIEW)

    bridge.sendChatMessage({ message: '' })
    bridge.sendChatMessage({ message: '   ' })
    bridge.sendChatMessage({ message: 42 })
    bridge.sendChatMessage({ message: null })
    bridge.sendChatMessage(null)
    bridge.sendChatMessage('   ')
    bridge.sendChatMessage({ context: {} })
    bridge.sendChatMessage({ message: { toString: () => 'Do a thing' } })

    expect(calls).toEqual([])
  })

  test('drops a message too long to be a chat bubble', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(VIEW)

    bridge.sendChatMessage({ message: 'x'.repeat(1001) })

    expect(calls).toEqual([])
  })

  test('legacy serialization failures reject the entire call', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(VIEW)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    for (const context of [cyclic, 1n, () => {}, { blob: 'x'.repeat(5000) }]) {
      bridge.sendChatMessage('Invalid legacy', context)
    }
    expect(calls).toEqual([])
    // Rejected arguments do not consume the message cooldown.
    bridge.sendChatMessage('Invalid legacy', 'x'.repeat(4998))
    expect(calls[0].attachments[0]).toMatchObject({
      label: 'Context',
      text: JSON.stringify('x'.repeat(4998))
    })
  })

  test('rejects the removed object context field with a clear error', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(VIEW)
    const log = spyOn(appletLog, 'reportAppletError').mockImplementation(() => {})
    try {
      bridge.sendChatMessage({ message: 'Review', context: undefined })
      expect(calls).toEqual([])
      expect(log.mock.calls[0][1].message).toContain('Use attachments instead')
    } finally {
      log.mockRestore()
    }
  })

  test('validates all attachments before emitting and snapshots all input fields', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(VIEW)
    const file = new File(['hello'], 'hello.txt')
    const text = { type: 'text', label: 'Order', text: '  snapshot  ' }
    const path = { type: 'file', path: 'reports/order.pdf' }
    const attachments = [text, { type: 'file', file }, path]
    for (const invalid of [
      null,
      {},
      { type: 'text', label: '', text: 'x' },
      { type: 'text', label: 'x'.repeat(121), text: 'x' },
      { type: 'text', label: 'x', text: 'x'.repeat(5001) },
      { type: 'file', path: '../secret' },
      { type: 'file', path: 'x', file },
      { type: 'file', file: new File([new Uint8Array(32 * 1024 * 1024 + 1)], 'big') }
    ]) {
      bridge.sendChatMessage({ message: 'Review', attachments: [...attachments, invalid] })
    }
    bridge.sendChatMessage({ message: 'Review', attachments: {} })
    expect(calls).toEqual([])
    bridge.sendChatMessage({ message: 'Review', attachments })
    text.text = 'changed'
    path.path = 'changed.txt'
    attachments.length = 0
    expect(calls[0].attachments).toEqual([
      { type: 'text', label: 'Order', text: '  snapshot  ', source: 'view:board' },
      { type: 'file', file, source: 'view:board' },
      { type: 'file', path: 'reports/order.pdf', source: 'view:board' }
    ])
  })

  test('an applet cannot send through a disposed bridge', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge, dispose } = appletRuntime(ws).connect(VIEW)

    bridge.sendChatMessage({ message: 'before' })
    dispose()
    bridge.sendChatMessage({ message: 'after' })

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

    bridge.sendChatMessage({ message: 'Sync now' })
    bridge.sendChatMessage({ message: 'Sync now' })
    bridge.sendChatMessage({ message: 'Sync now' })

    expect(calls.map(c => c.message)).toEqual(['Sync now'])
  })

  test('the cooldown is per applet and message, not a global mute', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const widget = appletRuntime(ws).connect(WIDGET)
    const view = appletRuntime(ws).connect(VIEW)

    widget.bridge.sendChatMessage({ message: 'Sync now' })
    // Same text, different applet — a real second message.
    view.bridge.sendChatMessage({ message: 'Sync now' })
    widget.bridge.sendChatMessage({ message: 'Something else' })

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

    for (let i = 0; i < 25; i++) bridge.sendChatMessage({ message: `message ${i}` })

    expect(calls).toHaveLength(10)
  })

  test('the cap is per workspace, so one runaway applet cannot mute another workspace', () => {
    const wsA = `ws-${crypto.randomUUID()}`
    const wsB = `ws-${crypto.randomUUID()}`
    const a = subscribeChat(wsA)
    const b = subscribeChat(wsB)

    for (let i = 0; i < 25; i++) {
      appletRuntime(wsA)
        .connect(WIDGET)
        .bridge.sendChatMessage({ message: `a ${i}` })
    }
    appletRuntime(wsB).connect(WIDGET).bridge.sendChatMessage({ message: 'b 0' })

    expect(a.calls).toHaveLength(10)
    expect(b.calls.map(c => c.message)).toEqual(['b 0'])
  })
})

describe('disposal', () => {
  test('a disposed connection is inert even while subscribers are live', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeNavigation(ws)

    const { bridge, dispose } = appletRuntime(ws).connect(VIEW)
    bridge.navigate('moi:/scratchpad')
    dispose()
    bridge.navigate('moi:/scratchpad')
    expect(calls).toEqual(['moi:/scratchpad'])
  })
})

// A stand-in for a loaded bundle's module namespace: the entry re-exports
// `__attachBridge` (see server/applets/build-applet.ts).
function fakeModule() {
  let bridge: AppletBridge | null = null
  return {
    __attachBridge: (next: AppletBridge) => {
      bridge = next
    },
    navigate: (href: unknown) => bridge?.navigate(href)
  }
}

describe('attachAppletBridge', () => {
  test('wires a module to its workspace runtime; invalidateApplet neuters it', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeNavigation(ws)

    const mod = fakeModule()
    attachAppletBridge(mod, ws, appletKey('views', ws, 'board'), VIEW)
    mod.navigate('moi:/views/board')
    expect(calls).toEqual(['moi:/views/board'])

    // The rebuild path: invalidation must leave the OLD module instance inert.
    invalidateApplet('views', ws, 'board')
    mod.navigate('moi:/views/board')
    expect(calls).toEqual(['moi:/views/board'])
  })

  test('invalidateAppletSegment disposes bridges kind-wide', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeNavigation(ws)

    const mod = fakeModule()
    const key = appletKey('widgets', ws, 'clock')
    // The load path caches the module before attaching (useApplet), and the
    // segment sweep walks cached keys — mirror that order here.
    setCachedApplet(key, Promise.resolve(mod))
    attachAppletBridge(mod, ws, key, WIDGET)
    invalidateAppletSegment('widgets')
    mod.navigate('moi:/overview')
    expect(calls).toEqual([])
  })

  test('no-ops on a bundle without the bridge exports (built before this change)', () => {
    const ws = `ws-${crypto.randomUUID()}`
    expect(() => attachAppletBridge({ default: () => null }, ws, 'views/x/y', VIEW)).not.toThrow()
    expect(() => disposeAppletBridge('views/x/y')).not.toThrow()
  })

  test('re-attaching under a key disposes the previous connection', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeNavigation(ws)
    const key = appletKey('views', ws, 'board')

    const oldMod = fakeModule()
    attachAppletBridge(oldMod, ws, key, VIEW)
    const newMod = fakeModule()
    attachAppletBridge(newMod, ws, key, VIEW)

    oldMod.navigate('moi:/scratchpad')
    newMod.navigate('moi:/overview')
    expect(calls).toEqual(['moi:/overview'])
  })
})

describe('workspace isolation', () => {
  test('bridges reach only their own workspace runtime', () => {
    const wsA = `ws-${crypto.randomUUID()}`
    const wsB = `ws-${crypto.randomUUID()}`
    const a = subscribeNavigation(wsA)
    const b = subscribeNavigation(wsB)

    appletRuntime(wsA).connect(VIEW).bridge.navigate('moi:/scratchpad')
    expect(a.calls).toEqual(['moi:/scratchpad'])
    expect(b.calls).toEqual([])
  })
})

describe('addChatAttachment', () => {
  test('accepts text and both file sources, stamps source, and ignores disposed bridges', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const received: unknown[] = []
    const runtime = appletRuntime(ws)
    const off = runtime.on('addChatAttachment', value => received.push(value))
    const { bridge, dispose } = runtime.connect(VIEW)
    const file = new File(['hello'], 'notes.txt')
    bridge.addChatAttachment({
      type: 'text',
      label: ' Notes ',
      text: '  hello\n',
      source: 'forged'
    })
    bridge.addChatAttachment({ type: 'file', file })
    const pathInput = { type: 'file', path: 'reports/september.pdf' }
    bridge.addChatAttachment(pathInput)
    pathInput.path = 'changed.pdf'
    dispose()
    bridge.addChatAttachment({ type: 'file', file })
    expect(received).toEqual([
      { type: 'text', label: 'Notes', text: '  hello\n', source: 'view:board' },
      { type: 'file', file, source: 'view:board' },
      { type: 'file', path: 'reports/september.pdf', source: 'view:board' }
    ])
    off()
  })

  test('rejects invalid text, file shapes, sizes and unsafe paths without emitting', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const received: unknown[] = []
    const runtime = appletRuntime(ws)
    const off = runtime.on('addChatAttachment', value => received.push(value))
    const { bridge } = runtime.connect(VIEW)
    const file = new File(['hello'], 'notes.txt')
    const oversized = new File([new Uint8Array(32 * 1024 * 1024 + 1)], 'large.bin')
    for (const input of [
      null,
      {},
      { type: 'text', label: '', text: 'hello' },
      { type: 'text', label: 'Notes', text: ' ' },
      { type: 'text', label: 'Notes', text: 'x'.repeat(5001) },
      { type: 'file' },
      { type: 'file', file: {} },
      { type: 'file', file: new Blob(['x']) },
      { type: 'file', file, path: 'notes.txt' },
      { type: 'file', file: oversized },
      ...['', '/etc/passwd', '../outside.txt', '.env', 'a/.hidden/b', 'C:\\file.txt'].map(path => ({
        type: 'file',
        path
      }))
    ])
      bridge.addChatAttachment(input)
    expect(received).toEqual([])
    off()
  })
})
