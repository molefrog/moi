import { expect, spyOn, test } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { useView } from './use-applet'
import * as cache from './applet-cache'
import * as journal from './applet-log'
import { Workspace } from '../workspace/workspace-context'
import { queryClient } from '@/client/api/query-client'
import { workspaceKeys } from '@/client/api/workspace-keys'

test('focus refresh keeps a view visible and ignores stale loads after navigation', async () => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  const globals = {
    window,
    document,
    HTMLElement: window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true
  }
  const descriptors = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  const first = () => <p>First view</p>
  const second = () => <p>Second view</p>
  let finish: (component: typeof first) => void = () => {}
  let next = Promise.resolve(first)
  const load = spyOn(cache, 'getCachedApplet').mockImplementation(() => next)
  const log = spyOn(journal, 'reportAppletError').mockImplementation(() => {})
  queryClient.setQueryData(workspaceKeys.descriptor('visitor'), {
    remote: { user_id: 'alice', workspace_id: 'board' }
  })
  type ProbeProps = { name: string }
  function Probe({ name }: ProbeProps) {
    const state = useView(name)
    return state.status === 'ready' ? <state.Component /> : <p>{state.status}</p>
  }
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () =>
      root.render(
        <Workspace id="visitor">
          <Probe name="first" />
        </Workspace>
      )
    )
    expect(document.body.textContent).toContain('First view')
    next = new Promise(resolve => {
      finish = resolve
    })
    await act(async () => {
      window.dispatchEvent(new window.Event('focus'))
    })
    expect(document.body.textContent).toContain('First view')
    next = Promise.resolve(second)
    await act(async () =>
      root.render(
        <Workspace id="visitor">
          <Probe name="second" />
        </Workspace>
      )
    )
    expect(document.body.textContent).toContain('Second view')
    await act(async () => finish(first))
    expect(document.body.textContent).toContain('Second view')
    next = Promise.reject(new Error('Owner unavailable'))
    await act(async () => {
      window.dispatchEvent(new window.Event('focus'))
    })
    expect(document.body.textContent).toContain('Second view')
    expect(log).toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount())
    load.mockRestore()
    log.mockRestore()
    queryClient.clear()
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
