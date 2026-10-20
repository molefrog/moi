import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'

import { onWorkspaceEventsReconnect, useWorkspaceEvent } from './use-workspace-events'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static OPEN = 1
  readyState = FakeWebSocket.OPEN
  closed = false
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }
  send() {}
  close() {
    this.closed = true
    this.onclose?.()
  }
}

function HomeShell() {
  useWorkspaceEvent(() => {})
  return <div>home</div>
}

function WorkspaceShell() {
  useWorkspaceEvent(() => {})
  return <div>workspace</div>
}

let cleanup = async () => {}
afterEach(() => cleanup())

// Switching routes unmounts one shell and mounts the other in a single commit.
// React runs the old tree's effect cleanups before the new tree's effects, so
// for an instant nothing is subscribed; that must not close the socket, or
// every navigation becomes a reconnect that refetches startup state.
test('a route switch keeps the events socket open and fires no reconnect', async () => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  const globals = {
    window,
    document,
    HTMLElement: window.HTMLElement,
    WebSocket: FakeWebSocket,
    IS_REACT_ACT_ENVIRONMENT: true
  }
  const descriptors = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, value })
  }
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true })
  const location = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', {
    value: { protocol: 'http:', host: 'localhost:13337' },
    configurable: true
  })
  let reconnects = 0
  const unsubscribe = onWorkspaceEventsReconnect(() => reconnects++)

  const root = createRoot(document.getElementById('root')!)
  cleanup = async () => {
    await act(async () => root.unmount())
    unsubscribe()
    FakeWebSocket.instances = []
    for (const [key, value] of descriptors) {
      if (value) Object.defineProperty(globalThis, key, value)
      else Reflect.deleteProperty(globalThis, key)
    }
    if (location) Object.defineProperty(globalThis, 'location', location)
  }

  await act(async () => root.render(<HomeShell />))
  expect(FakeWebSocket.instances.length).toBe(1)
  await act(async () => FakeWebSocket.instances[0]!.onopen?.())

  // One commit: the home shell's cleanup, then the workspace shell's effect.
  await act(async () => root.render(<WorkspaceShell />))
  expect(document.body.textContent).toContain('workspace')
  expect(FakeWebSocket.instances.length).toBe(1)
  expect(FakeWebSocket.instances[0]!.closed).toBe(false)
  expect(reconnects).toBe(0)
})
