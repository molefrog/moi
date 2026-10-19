import { afterEach, expect, spyOn, test } from 'bun:test'
import { act, useEffect, useLayoutEffect } from 'react'
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
  let exported: Blob | null = null
  let pendingExport: Promise<Blob | null> | undefined
  let mounted = true
  const flush = async () => (mounted ? (pendingExport ?? exported) : null)
  const cancel = async () => {
    await pendingExport
  }
  const layerSpy = spyOn(drawing, 'useDrawingLayer').mockImplementation(input => {
    options = input
    // Match the real layer: passive teardown discards the session, so flush
    // must capture its export before this runs.
    useEffect(
      () => () => {
        mounted = false
      },
      []
    )
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
        flush,
        deactivate: async () => null,
        finish: async () => null,
        cancel,
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
  type ContentProps = { available?: boolean }
  function Content({ available = true }: ContentProps) {
    const controller = useChatAnnotation({
      workspaceId: 'test',
      sessionId: null,
      activeTab: 'overview',
      mode: 'split',
      available,
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
  const remove = annotation.docked!.onRemove
  return {
    uploadSpy,
    change: (blob: Blob | null) => {
      exported = blob
      options?.onChange?.(blob)
    },
    pendingExport: () => {
      const deferred = Promise.withResolvers<Blob | null>()
      pendingExport = deferred.promise
      return deferred
    },
    remove: () => remove(stageSpy.mock.calls[0]![0].localId),
    cancel: () => act(async () => root.render(<Content available={false} />)),
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

for (const hasPreview of [false, true]) {
  test(`recovery waits for a pending export ${hasPreview ? 'with' : 'without'} an earlier preview`, async () => {
    const { change, pendingExport, uploadSpy, unmount } = await mount()
    if (hasPreview) change(new Blob(['earlier stroke']))
    const pending = pendingExport()
    await unmount()
    expect(uploadSpy).not.toHaveBeenCalled()
    const blob = new Blob(['latest strokes'])
    await act(async () => pending.resolve(blob))
    expect(uploadSpy).toHaveBeenCalledTimes(1)
    expect(uploadSpy.mock.calls[0]![0].blob).toBe(blob)
  })
}

test('cancel and recovery share one pending export and upload', async () => {
  const { change, cancel, pendingExport, uploadSpy, unmount } = await mount()
  change(new Blob(['earlier stroke']))
  const pending = pendingExport()
  await cancel()
  await unmount()
  expect(uploadSpy).not.toHaveBeenCalled()
  const blob = new Blob(['latest strokes'])
  await act(async () => pending.resolve(blob))
  expect(uploadSpy).toHaveBeenCalledTimes(1)
  expect(uploadSpy.mock.calls[0]![0].blob).toBe(blob)
})

test('finish during a pending recovery export does not upload twice', async () => {
  const { finish, pendingExport, uploadSpy, unmount } = await mount()
  const pending = pendingExport()
  await unmount()
  const blob = new Blob(['latest strokes'])
  await act(async () => {
    pending.resolve(blob)
    await finish(blob)
  })
  expect(uploadSpy).toHaveBeenCalledTimes(1)
})

test('recovery does not repeat an upload already started by finish', async () => {
  const { change, finish, uploadSpy, unmount } = await mount()
  const upload = Promise.withResolvers<void>()
  uploadSpy.mockReturnValue(upload.promise)
  const blob = new Blob(['finished'])
  change(blob)
  const finishing = finish(blob)
  await unmount()
  expect(uploadSpy).toHaveBeenCalledTimes(1)
  await act(async () => {
    upload.resolve()
    await finishing
  })
  expect(uploadSpy).toHaveBeenCalledTimes(1)
})

test('removing an annotation while cancel awaits export prevents its upload', async () => {
  const { change, cancel, remove, pendingExport, uploadSpy } = await mount()
  change(new Blob(['earlier stroke']))
  const pending = pendingExport()
  await cancel()
  remove()
  await act(async () => pending.resolve(new Blob(['latest strokes'])))
  expect(uploadSpy).not.toHaveBeenCalled()
})
