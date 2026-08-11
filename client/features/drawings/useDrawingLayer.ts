import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject
} from 'react'

import type { DrawingCanvasPointerProps, DrawingLayerProps } from './DrawingLayer'
import { captureElement, drawingCaptureScale } from './capture-element'

export type DrawingPoint = {
  x: number
  y: number
}

export type DrawingStroke = {
  points: DrawingPoint[]
}

export type DrawingHistory = {
  past: DrawingStroke[][]
  present: DrawingStroke[]
  future: DrawingStroke[][]
}

export type DrawingHistoryAction =
  | { type: 'commit'; stroke: DrawingStroke }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'clear' }

export const EMPTY_DRAWING_HISTORY: DrawingHistory = {
  past: [],
  present: [],
  future: []
}

export function drawingHistoryReducer(
  history: DrawingHistory,
  action: DrawingHistoryAction
): DrawingHistory {
  if (action.type === 'commit') {
    return {
      past: [...history.past, history.present],
      present: [...history.present, action.stroke],
      future: []
    }
  }

  if (action.type === 'undo') {
    const previous = history.past.at(-1)
    if (!previous) return history
    return {
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future]
    }
  }

  if (action.type === 'redo') {
    const next = history.future[0]
    if (!next) return history
    return {
      past: [...history.past, history.present],
      present: next,
      future: history.future.slice(1)
    }
  }

  if (history.present.length === 0) return history
  return {
    past: [...history.past, history.present],
    present: [],
    future: []
  }
}

export function pointOnCanvas(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): DrawingPoint {
  const bounds = canvas.getBoundingClientRect()
  return {
    x: ((clientX - bounds.left) / bounds.width) * canvas.width,
    y: ((clientY - bounds.top) / bounds.height) * canvas.height
  }
}

function coalescedPointsOnCanvas(canvas: HTMLCanvasElement, event: PointerEvent): DrawingPoint[] {
  const coalesced = event.getCoalescedEvents?.() ?? []
  const samples = coalesced.length > 0 ? coalesced : [event]
  return samples.map(sample => pointOnCanvas(canvas, sample.clientX, sample.clientY))
}

type DrawingLayerSession = {
  id: number
  snapshot: HTMLCanvasElement
  strokeColor: string
  haloColor: string
  targetWidth: number
  targetHeight: number
}

type DrawingExport = {
  sessionId: number
  historyVersion: number
  blob: Blob | null
}

type PendingDrawingExport = Omit<DrawingExport, 'blob'> & {
  promise: Promise<Blob | null>
}

type UseDrawingLayerOptions = {
  mode?: 'annotation' | 'sketch'
  onChange?: (blob: Blob | null) => void
  onEditingStart?: () => void
  onFinish?: (blob: Blob | null) => void | Promise<void>
}

// Undo/redo/clear availability. Deliberately NOT part of the controls object:
// it changes on every stroke commit, so components that need it subscribe via
// useDrawingHistoryState and re-render alone — a pen-up must not re-render
// the whole screen that hosts the hook.
export type DrawingHistoryState = {
  canUndo: boolean
  canRedo: boolean
  hasStrokes: boolean
}

const EMPTY_HISTORY_STATE: DrawingHistoryState = {
  canUndo: false,
  canRedo: false,
  hasStrokes: false
}

export type DrawingControls = {
  active: boolean
  visible: boolean
  starting: boolean
  finishing: boolean
  open: () => Promise<boolean>
  undo: () => void
  redo: () => void
  clear: () => void
  flush: () => Promise<Blob | null>
  deactivate: () => Promise<Blob | null>
  finish: () => Promise<Blob | null>
  cancel: () => Promise<void>
  subscribeHistory: (listener: () => void) => () => void
  getHistoryState: () => DrawingHistoryState
}

// Subscribe to the per-stroke history flags from the component that renders
// them (the toolbar), keeping stroke commits out of the host screen's renders.
export function useDrawingHistoryState(controls: DrawingControls): DrawingHistoryState {
  return useSyncExternalStore(
    controls.subscribeHistory,
    controls.getHistoryState,
    controls.getHistoryState
  )
}

export type DrawingController = {
  targetRef: RefObject<HTMLDivElement | null>
  controls: DrawingControls
  layerProps: DrawingLayerProps
}

function drawPath(
  context: CanvasRenderingContext2D,
  stroke: DrawingStroke,
  color: string,
  width: number
): void {
  const first = stroke.points[0]
  if (!first) return

  context.beginPath()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = width
  context.strokeStyle = color
  context.moveTo(first.x, first.y)
  for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y)
  if (stroke.points.length === 1) context.lineTo(first.x + 0.01, first.y + 0.01)
  context.stroke()
}

function drawDrawingStrokes(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  session: DrawingLayerSession,
  strokes: DrawingStroke[],
  draft: DrawingStroke | null = null
): void {
  const innerWidth = Math.max(3, Math.min(width, height) * 0.005)
  const outerWidth = innerWidth + Math.max(2, innerWidth * 0.75)
  const visible = draft ? [...strokes, draft] : strokes
  for (const stroke of visible) drawPath(context, stroke, session.haloColor, outerWidth)
  for (const stroke of visible) drawPath(context, stroke, session.strokeColor, innerWidth)
}

function renderDrawingLayer(
  canvas: HTMLCanvasElement,
  session: DrawingLayerSession,
  strokes: DrawingStroke[],
  draft: DrawingStroke | null = null
): void {
  const context = canvas.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, canvas.width, canvas.height)
  drawDrawingStrokes(context, canvas.width, canvas.height, session, strokes, draft)
}

function renderDrawingExport(
  canvas: HTMLCanvasElement,
  session: DrawingLayerSession,
  strokes: DrawingStroke[]
): void {
  const context = canvas.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(session.snapshot, 0, 0, canvas.width, canvas.height)
  drawDrawingStrokes(context, canvas.width, canvas.height, session, strokes)
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Could not export drawing'))
    }, 'image/png')
  })
}

function createBlankSession(
  target: HTMLDivElement,
  canvas: HTMLCanvasElement,
  id: number
): DrawingLayerSession | null {
  const bounds = target.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0) return null

  const styles = getComputedStyle(target)
  const scale = drawingCaptureScale(bounds.width, bounds.height, window.devicePixelRatio)
  const width = Math.max(1, Math.round(bounds.width * scale))
  const height = Math.max(1, Math.round(bounds.height * scale))
  const snapshot = document.createElement('canvas')
  snapshot.width = width
  snapshot.height = height
  const background = styles.getPropertyValue('--background').trim() || '#ffffff'
  const context = snapshot.getContext('2d')
  if (context) {
    context.fillStyle = background
    context.fillRect(0, 0, width, height)
  }
  canvas.width = width
  canvas.height = height

  return {
    id,
    snapshot,
    strokeColor: styles.getPropertyValue('--primary').trim() || '#2563eb',
    haloColor: background,
    targetWidth: bounds.width,
    targetHeight: bounds.height
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

export function useDrawingLayer({
  mode = 'annotation',
  onChange,
  onEditingStart,
  onFinish
}: UseDrawingLayerOptions = {}): DrawingController {
  const targetRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [session, setSession] = useState<DrawingLayerSession | null>(null)
  const sessionRef = useRef(session)
  const [editing, setEditing] = useState(false)
  const editingRef = useRef(false)
  const historyRef = useRef<DrawingHistory>(EMPTY_DRAWING_HISTORY)
  const historyStateRef = useRef<DrawingHistoryState>(EMPTY_HISTORY_STATE)
  const historyListenersRef = useRef(new Set<() => void>())
  const historyVersionRef = useRef(0)
  const draftRef = useRef<DrawingStroke | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const lifecycleRevisionRef = useRef(0)
  const latestExportRef = useRef<DrawingExport | null>(null)
  const pendingExportRef = useRef<PendingDrawingExport | null>(null)
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const [finishing, setFinishing] = useState(false)
  const finishingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const onEditingStartRef = useRef(onEditingStart)
  const onFinishRef = useRef(onFinish)
  onChangeRef.current = onChange
  onEditingStartRef.current = onEditingStart
  onFinishRef.current = onFinish

  // History flags live outside React state (see DrawingHistoryState): only
  // subscribed components re-render on a stroke commit, not the host screen.
  const publishHistory = useCallback(() => {
    const history = historyRef.current
    const previous = historyStateRef.current
    const next: DrawingHistoryState = {
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      hasStrokes: history.present.length > 0
    }
    if (
      next.canUndo === previous.canUndo &&
      next.canRedo === previous.canRedo &&
      next.hasStrokes === previous.hasStrokes
    ) {
      return
    }
    historyStateRef.current = next
    for (const listener of historyListenersRef.current) listener()
  }, [])

  const subscribeHistory = useCallback((listener: () => void) => {
    historyListenersRef.current.add(listener)
    return () => {
      historyListenersRef.current.delete(listener)
    }
  }, [])

  const getHistoryState = useCallback(() => historyStateRef.current, [])

  const redraw = useCallback((strokes: DrawingStroke[], draft: DrawingStroke | null = null) => {
    const canvas = canvasRef.current
    const current = sessionRef.current
    if (canvas && current) renderDrawingLayer(canvas, current, strokes, draft)
  }, [])

  const exportCommitted = useCallback(
    (
      current: DrawingLayerSession,
      strokes: DrawingStroke[],
      historyVersion: number
    ): Promise<Blob | null> => {
      const cached = latestExportRef.current
      if (cached?.sessionId === current.id && cached.historyVersion === historyVersion) {
        return Promise.resolve(cached.blob)
      }

      const pending = pendingExportRef.current
      if (pending?.sessionId === current.id && pending.historyVersion === historyVersion) {
        return pending.promise
      }

      if (strokes.length === 0) {
        latestExportRef.current = { sessionId: current.id, historyVersion, blob: null }
        onChangeRef.current?.(null)
        return Promise.resolve(null)
      }

      const exportCanvas = document.createElement('canvas')
      exportCanvas.width = current.snapshot.width
      exportCanvas.height = current.snapshot.height
      renderDrawingExport(exportCanvas, current, strokes)

      const promise = canvasBlob(exportCanvas)
        .then(blob => {
          if (
            sessionRef.current?.id !== current.id ||
            historyVersionRef.current !== historyVersion
          ) {
            return blob
          }
          latestExportRef.current = { sessionId: current.id, historyVersion, blob }
          onChangeRef.current?.(blob)
          return blob
        })
        .catch(() => latestExportRef.current?.blob ?? null)
        .finally(() => {
          if (pendingExportRef.current?.promise === promise) pendingExportRef.current = null
        })

      pendingExportRef.current = { sessionId: current.id, historyVersion, promise }
      return promise
    },
    []
  )

  const cancelStroke = useCallback(() => {
    if (!draftRef.current) return
    const canvas = canvasRef.current
    const pointerId = pointerIdRef.current
    if (canvas && pointerId !== null && canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId)
    }
    draftRef.current = null
    pointerIdRef.current = null
    redraw(historyRef.current.present)
  }, [redraw])

  const apply = useCallback(
    (action: DrawingHistoryAction) => {
      const current = sessionRef.current
      if (!current || finishingRef.current) return
      const next = drawingHistoryReducer(historyRef.current, action)
      if (next === historyRef.current) return
      historyRef.current = next
      publishHistory()
      draftRef.current = null
      const historyVersion = ++historyVersionRef.current
      redraw(next.present)
      void exportCommitted(current, next.present, historyVersion)
    },
    [exportCommitted, publishHistory, redraw]
  )

  const installSession = useCallback(
    (next: DrawingLayerSession) => {
      historyRef.current = EMPTY_DRAWING_HISTORY
      historyVersionRef.current = 0
      latestExportRef.current = null
      pendingExportRef.current = null
      draftRef.current = null
      pointerIdRef.current = null
      publishHistory()
      sessionRef.current = next
      setSession(next)
    },
    [publishHistory]
  )

  const beginEditing = useCallback(() => {
    if (editingRef.current) return
    editingRef.current = true
    setEditing(true)
    onEditingStartRef.current?.()
  }, [])

  const open = useCallback(async (): Promise<boolean> => {
    const target = targetRef.current
    if (!target || sessionRef.current || startingRef.current) return false

    const revision = ++lifecycleRevisionRef.current
    startingRef.current = true
    setStarting(true)
    try {
      const snapshot = await captureElement(target)
      if (revision !== lifecycleRevisionRef.current || targetRef.current !== target) return false

      const bounds = target.getBoundingClientRect()
      const styles = getComputedStyle(target)
      const next: DrawingLayerSession = {
        id: revision,
        snapshot,
        strokeColor: styles.getPropertyValue('--primary').trim() || '#2563eb',
        haloColor: styles.getPropertyValue('--background').trim() || '#ffffff',
        targetWidth: bounds.width,
        targetHeight: bounds.height
      }
      installSession(next)
      beginEditing()
      return true
    } finally {
      if (revision === lifecycleRevisionRef.current) {
        startingRef.current = false
        setStarting(false)
      }
    }
  }, [beginEditing, installSession])

  const cancel = useCallback((): Promise<void> => {
    const current = sessionRef.current
    lifecycleRevisionRef.current += 1
    startingRef.current = false
    finishingRef.current = false
    setStarting(false)
    setFinishing(false)
    editingRef.current = false
    setEditing(false)
    cancelStroke()
    setSession(null)
    historyRef.current = EMPTY_DRAWING_HISTORY
    publishHistory()
    const pending = pendingExportRef.current
    if (!current || pending?.sessionId !== current.id) {
      sessionRef.current = null
      return Promise.resolve()
    }
    return pending.promise.then(() => {
      if (sessionRef.current?.id === current.id) sessionRef.current = null
    })
  }, [cancelStroke, publishHistory])

  const flush = useCallback(async (): Promise<Blob | null> => {
    const current = sessionRef.current
    if (!current) return null
    cancelStroke()
    return exportCommitted(current, historyRef.current.present, historyVersionRef.current)
  }, [cancelStroke, exportCommitted])

  const deactivate = useCallback(async (): Promise<Blob | null> => {
    editingRef.current = false
    setEditing(false)
    return flush()
  }, [flush])

  const finish = useCallback(async (): Promise<Blob | null> => {
    const current = sessionRef.current
    if (!current || finishingRef.current) return null

    finishingRef.current = true
    setFinishing(true)
    cancelStroke()
    const historyVersion = historyVersionRef.current
    const strokes = historyRef.current.present
    let blob: Blob | null = null
    if (strokes.length > 0 || historyVersion > 0) {
      blob = await exportCommitted(current, strokes, historyVersion)
    }

    if (sessionRef.current?.id !== current.id) return blob
    try {
      await onFinishRef.current?.(blob)
    } finally {
      if (sessionRef.current?.id === current.id) {
        lifecycleRevisionRef.current += 1
        editingRef.current = false
        setEditing(false)
        sessionRef.current = null
        setSession(null)
        finishingRef.current = false
        setFinishing(false)
      }
    }
    return blob
  }, [cancelStroke, exportCommitted])

  const undo = useCallback(() => apply({ type: 'undo' }), [apply])
  const redo = useCallback(() => apply({ type: 'redo' }), [apply])
  const clear = useCallback(() => apply({ type: 'clear' }), [apply])

  // Everything returned from here down is identity-stable across renders
  // (callbacks hold state in refs), so hosts can memoize children that take
  // these objects as props. Identities change only with the session lifecycle.
  const pointerProps: DrawingCanvasPointerProps = useMemo(
    () => ({
      onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (
          finishingRef.current ||
          !event.isPrimary ||
          (event.pointerType === 'mouse' && event.button !== 0)
        ) {
          return
        }
        if (!sessionRef.current && mode === 'sketch') {
          const target = targetRef.current
          if (!target) return
          const next = createBlankSession(
            target,
            event.currentTarget,
            ++lifecycleRevisionRef.current
          )
          if (!next) return
          installSession(next)
        }
        if (!sessionRef.current) return
        beginEditing()
        pointerIdRef.current = event.pointerId
        event.currentTarget.setPointerCapture(event.pointerId)
        draftRef.current = {
          points: [pointOnCanvas(event.currentTarget, event.clientX, event.clientY)]
        }
        redraw(historyRef.current.present, draftRef.current)
      },
      onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (event.pointerId !== pointerIdRef.current || !draftRef.current) return
        draftRef.current = {
          points: [
            ...draftRef.current.points,
            ...coalescedPointsOnCanvas(event.currentTarget, event.nativeEvent)
          ]
        }
        redraw(historyRef.current.present, draftRef.current)
      },
      onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (event.pointerId !== pointerIdRef.current || !draftRef.current) return
        const stroke = {
          points: [
            ...draftRef.current.points,
            ...coalescedPointsOnCanvas(event.currentTarget, event.nativeEvent)
          ]
        }
        draftRef.current = null
        pointerIdRef.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        apply({ type: 'commit', stroke })
      },
      onPointerCancel: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (event.pointerId === pointerIdRef.current) cancelStroke()
      }
    }),
    [apply, beginEditing, cancelStroke, installSession, mode, redraw]
  )

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (isEditableTarget(event.target)) return
      if (event.key === 'Escape' && mode === 'annotation') {
        event.preventDefault()
        void finish()
        return
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    },
    [finish, mode, redo, undo]
  )

  useLayoutEffect(() => {
    if (!session) return
    redraw(historyRef.current.present, draftRef.current)
    if (editing) canvasRef.current?.focus()
  }, [editing, redraw, session])

  useEffect(() => {
    if (!session || mode === 'sketch') return
    const target = targetRef.current
    if (!target) {
      void cancel()
      return
    }

    const observer = new ResizeObserver(entries => {
      const bounds = entries[0]?.contentRect
      if (!bounds) return
      if (
        Math.abs(bounds.width - session.targetWidth) > 1 ||
        Math.abs(bounds.height - session.targetHeight) > 1
      ) {
        void cancel()
      }
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [cancel, mode, session])

  useEffect(
    () => () => {
      lifecycleRevisionRef.current += 1
      editingRef.current = false
      sessionRef.current = null
    },
    []
  )

  const controls: DrawingControls = useMemo(
    () => ({
      active: editing,
      visible: mode === 'sketch' || session !== null,
      starting,
      finishing,
      open,
      undo,
      redo,
      clear,
      flush,
      deactivate,
      finish,
      cancel,
      subscribeHistory,
      getHistoryState
    }),
    [
      editing,
      mode,
      session,
      starting,
      finishing,
      open,
      undo,
      redo,
      clear,
      flush,
      deactivate,
      finish,
      cancel,
      subscribeHistory,
      getHistoryState
    ]
  )

  const layerProps: DrawingLayerProps = useMemo(
    () => ({
      visible: controls.visible,
      editing: controls.active,
      canvasRef,
      width: session?.snapshot.width ?? 1,
      height: session?.snapshot.height ?? 1,
      pointerProps,
      onKeyDown
    }),
    [controls.active, controls.visible, session, pointerProps, onKeyDown]
  )

  return useMemo(() => ({ targetRef, controls, layerProps }), [controls, layerProps])
}
