import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'

import { AppProvider } from '@/client/app/app-provider'

import { useWorkspaceEvent } from './use-workspace-events'
import { WorkspaceEventsClient } from './workspace-events'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static OPEN = 1
  readyState = 0
  closed = false
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }
  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.closed = true
    this.readyState = 3
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

function installDom() {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true })
  const globals = {
    window,
    document,
    location: { protocol: 'http:', host: 'localhost:13337' },
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
  const root = createRoot(document.getElementById('root')!)
  cleanup = async () => {
    await act(async () => root.unmount())
    FakeWebSocket.instances = []
    for (const [key, value] of descriptors) {
      if (value) Object.defineProperty(globalThis, key, value)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
  return { root, document }
}

// Switching routes unmounts one shell and mounts the other in a single commit,
// so for an instant nothing is subscribed. The socket belongs to the app, not
// to its subscribers, so that must not reconnect.
test('a route switch keeps the one events socket open', async () => {
  const { root, document } = installDom()
  await act(async () =>
    root.render(
      <AppProvider>
        <HomeShell />
      </AppProvider>
    )
  )
  expect(FakeWebSocket.instances.length).toBe(1)
  await act(async () => FakeWebSocket.instances[0]!.open())

  await act(async () =>
    root.render(
      <AppProvider>
        <WorkspaceShell />
      </AppProvider>
    )
  )
  expect(document.body.textContent).toContain('workspace')
  expect(FakeWebSocket.instances.length).toBe(1)
  expect(FakeWebSocket.instances[0]!.closed).toBe(false)
})

test('unmounting the app closes the socket for good', async () => {
  const { root } = installDom()
  await act(async () =>
    root.render(
      <AppProvider>
        <HomeShell />
      </AppProvider>
    )
  )
  await act(async () => FakeWebSocket.instances[0]!.open())
  await act(async () => root.unmount())
  expect(FakeWebSocket.instances[0]!.closed).toBe(true)
  await Bun.sleep(1100)
  expect(FakeWebSocket.instances.length).toBe(1)
})

test('components outside the app open no socket', async () => {
  const { root, document } = installDom()
  await act(async () => root.render(<HomeShell />))
  expect(document.body.textContent).toContain('home')
  expect(FakeWebSocket.instances.length).toBe(0)
})

test('a dropped socket reopens on its own and delivers events again', async () => {
  installDom()
  const client = new WorkspaceEventsClient('ws://localhost/api/workspaces/ws', {
    reconnectBaseDelayMs: 1
  })
  const received: string[] = []
  client.subscribe(event => received.push(event.type))
  client.connect()
  FakeWebSocket.instances[0]!.open()

  FakeWebSocket.instances[0]!.close()
  await Bun.sleep(10)
  expect(FakeWebSocket.instances.length).toBe(2)
  FakeWebSocket.instances[1]!.open()
  FakeWebSocket.instances[1]!.onmessage?.({ data: JSON.stringify({ type: 'theme:updated' }) })
  expect(received).toEqual(['theme:updated'])
  client.close()
})
