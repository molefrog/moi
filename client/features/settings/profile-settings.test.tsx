import { afterEach, expect, spyOn, test } from 'bun:test'
import { act, useState } from 'react'
import { parseHTML } from 'linkedom'
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query'
import { NameField } from './profile-settings'
import { toast } from '@/client/components/ui/toast'

let cleanup = async () => {}
afterEach(() => cleanup())

async function mountField(
  save: (name: string) => Promise<string> = async name => name,
  readOnly = false
) {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  Object.defineProperty(document, 'oninput', { value: null, configurable: true })
  const globals = {
    window,
    document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    IS_REACT_ACT_ENVIRONMENT: true
  }
  const descriptors = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(document.getElementById('root')!)
  const saved: string[] = []
  function Form() {
    const [name, setName] = useState('Alex')
    return (
      <NameField
        name={name}
        readOnly={readOnly}
        onSave={async value => {
          saved.push(value)
          const next = await save(value)
          setName(next)
          return next
        }}
      />
    )
  }
  notifyManager.setNotifyFunction(callback => act(callback))
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const notification = spyOn(toast, 'add')
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <Form />
      </QueryClientProvider>
    )
  )
  const input = document.querySelector('input')!
  input.type = 'text'
  const emit = async (type: string, key?: string) =>
    act(async () => {
      input.type = 'text'
      const event = new window.Event(type, { bubbles: true })
      if (key) Object.defineProperty(event, 'key', { value: key })
      input.dispatchEvent(event)
      await new Promise(resolve => setTimeout(resolve, 5))
    })
  // linkedom does not dispatch focus events from focus()/blur().
  input.blur = () => {
    input.dispatchEvent(new window.Event('focusout', { bubbles: true }))
  }
  cleanup = async () => {
    await act(async () => root.unmount())
    qc.clear()
    notification.mockRestore()
    notifyManager.setNotifyFunction(callback => callback())
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
  return {
    document,
    input,
    saved,
    notification,
    emit,
    async type(value: string) {
      await act(async () => {
        input.type = 'text'
        // Support React's legacy input events when another test loaded it before the DOM.
        Object.assign(input, { attachEvent() {}, detachEvent() {} })
        input.dispatchEvent(new window.Event('focusin', { bubbles: true }))
        // Set the native value without React's tracker to simulate user input.
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )!.set!
        setter.call(input, value)
        input.dispatchEvent(new window.Event('input', { bubbles: true }))
        input.dispatchEvent(new window.Event('keyup', { bubbles: true }))
      })
    }
  }
}

test('blur saves a trimmed name and skips unchanged values', async () => {
  const ui = await mountField()
  await ui.type('  Ada  ')
  await ui.emit('focusout')
  expect(ui.saved).toEqual(['Ada'])
  expect(ui.input.value).toBe('Ada')
  await ui.emit('focusout')
  expect(ui.saved).toHaveLength(1)
})

test('Enter saves and Escape discards without saving', async () => {
  const ui = await mountField()
  await ui.type('Ada')
  await ui.emit('keydown', 'Escape')
  expect(ui.input.value).toBe('Alex')
  expect(ui.saved).toEqual([])
  await ui.type('Grace')
  await ui.emit('keydown', 'Enter')
  expect(ui.saved).toEqual(['Grace'])
})

test('empty names restore the saved value without an error', async () => {
  const ui = await mountField()
  await ui.type('   ')
  await ui.emit('focusout')
  expect(ui.saved).toEqual([])
  expect(ui.input.value).toBe('Alex')
  expect(ui.document.querySelector('[role="alert"]')).toBeNull()
  expect(ui.document.querySelector('button')).toBeNull()
  expect(ui.notification).not.toHaveBeenCalled()
})

test('a failed save shows a toast and keeps the draft to retry on blur', async () => {
  let fail = true
  const ui = await mountField(async name => {
    if (fail) throw new Error('Connection lost')
    return name
  })
  await ui.type('Ada')
  await ui.emit('focusout')
  expect(ui.input.value).toBe('Ada')
  expect(ui.notification).toHaveBeenCalledWith({
    title: 'Couldn’t save name',
    description: 'Connection lost',
    type: 'error'
  })
  expect(ui.document.querySelector('[role="alert"]')).toBeNull()
  expect(ui.document.querySelector('button')).toBeNull()
  fail = false
  await ui.emit('focusout')
  expect(ui.saved).toEqual(['Ada', 'Ada'])
  expect(ui.input.value).toBe('Ada')
})

test('provider-managed names cannot be saved', async () => {
  const ui = await mountField(async name => name, true)
  expect(ui.input.hasAttribute('readOnly')).toBe(true)
  await ui.emit('focusout')
  expect(ui.saved).toEqual([])
})

test('a pending name save disables editing and ignores another blur', async () => {
  const request = Promise.withResolvers<string>()
  const ui = await mountField(() => request.promise)
  await ui.type('Ada')
  await ui.emit('focusout')
  expect(ui.input.disabled).toBe(true)
  await ui.emit('focusout')
  expect(ui.saved).toEqual(['Ada'])
  await act(async () => {
    request.resolve('Ada')
    await new Promise(resolve => setTimeout(resolve, 5))
  })
  expect(ui.input.disabled).toBe(false)
  expect(ui.input.value).toBe('Ada')
})
