import { expect, test } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { Workspace } from '@/client/features/workspace/workspace-context'
import { UserMessageBubble } from './user-message-bubble'

test('shows a toggle only for overflow and lets the user expand and collapse', async () => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  let measure = () => {}
  const globals = {
    window,
    document,
    HTMLElement: window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class {
      constructor(callback: () => void) {
        measure = callback
      }
      observe() {}
      disconnect() {}
    }
  }
  const descriptors = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () =>
      root.render(
        <Workspace id="test">
          <UserMessageBubble content="## A message" />
        </Workspace>
      )
    )
    const viewport = document.querySelector('[id]:not(#root)')!
    const body = viewport.firstElementChild!
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 320 })
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 100 })
    await act(async () => measure())
    expect(document.querySelector('button')).toBeNull()
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 600 })
    await act(async () => measure())
    const button = document.querySelector('button')!
    expect(button.textContent).toContain('Show more')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    await act(async () => button.click())
    expect(button.textContent).toContain('Show less')
    expect(button.getAttribute('aria-expanded')).toBe('true')
    await act(async () => button.click())
    expect(button.textContent).toContain('Show more')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 100 })
    await act(async () => measure())
    expect(document.querySelector('button')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
