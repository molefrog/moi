import { afterEach, expect, spyOn, test } from 'bun:test'
import { act, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'

import * as drawing from './useDrawingLayer'
import * as attachments from '@/client/features/chat/composer/attachments/draft-attachments'
import { useChatAnnotation, type ChatAnnotationController } from './useChatAnnotation'

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
  let options: Parameters<typeof drawing.useDrawingLayer>[0]
  const layerSpy = spyOn(drawing, 'useDrawingLayer').mockImplementation(input => {
    options = input
    return {
      targetRef: { current: null },
      controls: {
        active: false,
        visible: false,
        starting: false,
        finishing: false,
        open: async () => true,
        undo: () => {},
        redo: () => {},
        clear: () => {},
        flush: async () => null,
        deactivate: async () => null,
        finish: async () => null,
        cancel: async () => {},
        subscribeHistory: () => () => {},
        getHistoryState: () => ({ canUndo: false, canRedo: false, hasStrokes: false })
      },
      layerProps: {
        visible: false,
        editing: false,
        canvasRef: { current: null },
        width: 1,
        height: 1,
        pointerProps: {
          onPointerDown: () => {},
          onPointerMove: () => {},
          onPointerUp: () => {},
          onPointerCancel: () => {}
        },
        onKeyDown: () => {}
      }
    }
  })
  const stageSpy = spyOn(attachments, 'stageDrawingDraft').mockReturnValue(true)
  const uploadSpy = spyOn(attachments, 'stageDrawing').mockResolvedValue()
  let annotation!: ChatAnnotationController
  function Content() {
    const controller = useChatAnnotation({
      workspaceId: 'test',
      sessionId: null,
      activeTab: 'overview',
      mode: 'split',
      available: true,
      closePopup: () => {},
      openPopup: () => {}
    })
    useLayoutEffect(() => {
      annotation = controller
    }, [controller])
    return null
  }
  const root = createRoot(document.getElementById('root')!)
  cleanup = async () => {
    await act(async () => root.unmount())
    layerSpy.mockRestore()
    stageSpy.mockRestore()
    uploadSpy.mockRestore()
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
  await act(async () => root.render(<Content />))
  await act(async () => annotation.docked?.onToggle())
  return {
    uploadSpy,
    change: (blob: Blob | null) => options?.onChange?.(blob),
    finish: (blob: Blob) => options?.onFinish?.(blob),
    unmount: () => act(async () => root.render(null))
  }
}

test('recovery uploads the latest unfinished annotation once', async () => {
  const { change, uploadSpy, unmount } = await mount()
  change(new Blob(['first stroke']))
  const blob = new Blob(['latest strokes'])
  change(blob)
  expect(uploadSpy).not.toHaveBeenCalled()
  await unmount()
  expect(uploadSpy).toHaveBeenCalledTimes(1)
  expect(uploadSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaceId: 'test',
      sessionId: null,
      source: 'overview',
      blob
    })
  )
})

test('recovery does not upload a finished annotation twice', async () => {
  const { change, finish, uploadSpy, unmount } = await mount()
  const blob = new Blob(['finished'])
  change(blob)
  await finish(blob)
  await unmount()
  expect(uploadSpy).toHaveBeenCalledTimes(1)
})

test('recovery does not upload an empty annotation', async () => {
  const { change, uploadSpy, unmount } = await mount()
  change(new Blob(['erased']))
  change(null)
  await unmount()
  expect(uploadSpy).not.toHaveBeenCalled()
})
