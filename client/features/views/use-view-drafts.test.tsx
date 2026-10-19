import { afterEach, expect, mock, test } from 'bun:test'
import { act, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'

import { useUiStore } from '@/client/store/ui'
import { composerDraftKey, draftSessionId } from '@/lib/session-drafts'
import { viewTabId } from '@/lib/workspace-tabs'
import type { PendingView } from '@/lib/types'
import { useViewDrafts } from './useViewDrafts'

let cleanup = async () => {}
afterEach(() => cleanup())

async function mount() {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  const globals = { window, document, IS_REACT_ACT_ENVIRONMENT: true }
  const descriptors = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  const originalDrafts = useUiStore.getState().composerDrafts
  const workspaceId = 'draft-save-test'
  const key = composerDraftKey(workspaceId, draftSessionId(viewTabId('draft')))
  let pendingViews: PendingView[] = [{ id: 'draft', status: 'draft', requirements: 'Saved text' }]
  const save = mock(async (_viewId: string, _requirements: string) => {})
  let clear: (viewId: string) => void = () => {}
  function Content() {
    const controller = useViewDrafts({ workspaceId, pendingViews, onSave: save })
    useLayoutEffect(() => {
      clear = controller.clear
    }, [controller.clear])
    return null
  }
  const root = createRoot(document.getElementById('root')!)
  const render = async (visible = true) => {
    await act(async () => root.render(visible ? <Content /> : null))
  }
  cleanup = async () => {
    await act(async () => root.unmount())
    useUiStore.setState({ composerDrafts: originalDrafts })
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
  await render()
  return {
    save,
    key,
    render,
    edit: (text: string) => act(() => useUiStore.getState().setComposerDraft(key, text)),
    clear: () => act(() => clear('draft')),
    submit: async () => {
      pendingViews = [{ ...pendingViews[0]!, status: 'submitted' }]
      await render()
    }
  }
}

test('recovery flushes the latest pending description once and remount restores local text', async () => {
  const { save, key, edit, render } = await mount()
  edit('First edit')
  edit('Latest edit')
  expect(save).not.toHaveBeenCalled()
  await render(false)
  expect(save.mock.calls).toEqual([['draft', 'Latest edit']])
  await render()
  expect(useUiStore.getState().composerDrafts[key]).toBe('Latest edit')
  await Bun.sleep(550)
  expect(save).toHaveBeenCalledTimes(1)
})

test('a description already saved by the debounce is not saved again on unmount', async () => {
  const { save, edit, render } = await mount()
  edit('Updated text')
  await Bun.sleep(550)
  expect(save.mock.calls).toEqual([['draft', 'Updated text']])
  await render(false)
  expect(save).toHaveBeenCalledTimes(1)
})

test('discarded and submitted descriptions are not flushed back into a draft', async () => {
  const { save, edit, clear, submit, render } = await mount()
  edit('Discard me')
  clear()
  await render(false)
  expect(save).not.toHaveBeenCalled()
  await render()
  edit('Submit me')
  await submit()
  await render(false)
  await Bun.sleep(550)
  expect(save).not.toHaveBeenCalled()
})

test('recovery does not cancel an in-flight save', async () => {
  const { save, edit, render } = await mount()
  let finish!: () => void
  const pending = new Promise<void>(resolve => {
    finish = resolve
  })
  save.mockImplementation(() => pending)
  edit('In flight')
  await Bun.sleep(550)
  await render(false)
  finish()
  await pending
  expect(save.mock.calls).toEqual([['draft', 'In flight']])
})
