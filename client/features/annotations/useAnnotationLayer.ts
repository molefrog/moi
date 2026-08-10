import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject
} from 'react'

import type { AnnotationCanvasPointerProps, AnnotationLayerProps } from './AnnotationLayer'
import { captureElement } from './capture-element'

export type AnnotationPoint = {
  x: number
  y: number
}

export type AnnotationStroke = {
  points: AnnotationPoint[]
}

export type AnnotationHistory = {
  past: AnnotationStroke[][]
  present: AnnotationStroke[]
  future: AnnotationStroke[][]
}

export type AnnotationHistoryAction =
  | { type: 'commit'; stroke: AnnotationStroke }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'clear' }

export const EMPTY_ANNOTATION_HISTORY: AnnotationHistory = {
  past: [],
  present: [],
  future: []
}

export function annotationHistoryReducer(
  history: AnnotationHistory,
  action: AnnotationHistoryAction
): AnnotationHistory {
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
): AnnotationPoint {
  const bounds = canvas.getBoundingClientRect()
  return {
    x: ((clientX - bounds.left) / bounds.width) * canvas.width,
    y: ((clientY - bounds.top) / bounds.height) * canvas.height
  }
}

type AnnotationLayerSession = {
  id: number
  snapshot: HTMLCanvasElement
  strokeColor: string
  haloColor: string
  targetWidth: number
  targetHeight: number
}

type AnnotationExport = {
  sessionId: number
  historyVersion: number
  blob: Blob | null
}

type PendingAnnotationExport = Omit<AnnotationExport, 'blob'> & {
  promise: Promise<Blob | null>
}

type UseAnnotationLayerOptions = {
  onChange?: (blob: Blob | null) => void
  onFinish?: (blob: Blob | null) => void | Promise<void>
}

export type AnnotationControls = {
  active: boolean
  starting: boolean
  finishing: boolean
  canUndo: boolean
  canRedo: boolean
  hasStrokes: boolean
  open: () => Promise<boolean>
  undo: () => void
  redo: () => void
  clear: () => void
  finish: () => Promise<Blob | null>
  cancel: () => void
}

export type AnnotationController = {
  targetRef: RefObject<HTMLDivElement | null>
  controls: AnnotationControls
  layerProps: AnnotationLayerProps
}

function drawPath(
  context: CanvasRenderingContext2D,
  stroke: AnnotationStroke,
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

function renderAnnotation(
  canvas: HTMLCanvasElement,
  session: AnnotationLayerSession,
  strokes: AnnotationStroke[],
  draft: AnnotationStroke | null = null
): void {
  const context = canvas.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(session.snapshot, 0, 0, canvas.width, canvas.height)

  const innerWidth = Math.max(3, Math.min(canvas.width, canvas.height) * 0.005)
  const outerWidth = innerWidth + Math.max(2, innerWidth * 0.75)
  const visible = draft ? [...strokes, draft] : strokes
  for (const stroke of visible) drawPath(context, stroke, session.haloColor, outerWidth)
  for (const stroke of visible) drawPath(context, stroke, session.strokeColor, innerWidth)
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Could not export annotation'))
    }, 'image/png')
  })
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

export function useAnnotationLayer({
  onChange,
  onFinish
}: UseAnnotationLayerOptions = {}): AnnotationController {
  const targetRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [session, setSession] = useState<AnnotationLayerSession | null>(null)
  const sessionRef = useRef(session)
  const [history, setHistory] = useState<AnnotationHistory>(EMPTY_ANNOTATION_HISTORY)
  const historyRef = useRef<AnnotationHistory>(EMPTY_ANNOTATION_HISTORY)
  const historyVersionRef = useRef(0)
  const draftRef = useRef<AnnotationStroke | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const lifecycleRevisionRef = useRef(0)
  const latestExportRef = useRef<AnnotationExport | null>(null)
  const pendingExportRef = useRef<PendingAnnotationExport | null>(null)
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const [finishing, setFinishing] = useState(false)
  const finishingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const onFinishRef = useRef(onFinish)
  onChangeRef.current = onChange
  onFinishRef.current = onFinish

  const redraw = useCallback(
    (strokes: AnnotationStroke[], draft: AnnotationStroke | null = null) => {
      const canvas = canvasRef.current
      const current = sessionRef.current
      if (canvas && current) renderAnnotation(canvas, current, strokes, draft)
    },
    []
  )

  const exportCommitted = useCallback(
    (
      current: AnnotationLayerSession,
      strokes: AnnotationStroke[],
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
      renderAnnotation(exportCanvas, current, strokes)

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
    (action: AnnotationHistoryAction) => {
      const current = sessionRef.current
      if (!current || finishingRef.current) return
      const next = annotationHistoryReducer(historyRef.current, action)
      if (next === historyRef.current) return
      historyRef.current = next
      setHistory(next)
      draftRef.current = null
      const historyVersion = ++historyVersionRef.current
      redraw(next.present)
      void exportCommitted(current, next.present, historyVersion)
    },
    [exportCommitted, redraw]
  )

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
      const next: AnnotationLayerSession = {
        id: revision,
        snapshot,
        strokeColor: styles.getPropertyValue('--primary').trim() || '#2563eb',
        haloColor: styles.getPropertyValue('--background').trim() || '#ffffff',
        targetWidth: bounds.width,
        targetHeight: bounds.height
      }
      historyRef.current = EMPTY_ANNOTATION_HISTORY
      historyVersionRef.current = 0
      latestExportRef.current = null
      pendingExportRef.current = null
      draftRef.current = null
      pointerIdRef.current = null
      setHistory(EMPTY_ANNOTATION_HISTORY)
      sessionRef.current = next
      setSession(next)
      return true
    } finally {
      if (revision === lifecycleRevisionRef.current) {
        startingRef.current = false
        setStarting(false)
      }
    }
  }, [])

  const cancel = useCallback(() => {
    lifecycleRevisionRef.current += 1
    startingRef.current = false
    finishingRef.current = false
    setStarting(false)
    setFinishing(false)
    cancelStroke()
    sessionRef.current = null
    setSession(null)
  }, [cancelStroke])

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

  const pointerProps: AnnotationCanvasPointerProps = {
    onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (
        finishingRef.current ||
        !event.isPrimary ||
        (event.pointerType === 'mouse' && event.button !== 0)
      ) {
        return
      }
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
          pointOnCanvas(event.currentTarget, event.clientX, event.clientY)
        ]
      }
      redraw(historyRef.current.present, draftRef.current)
    },
    onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.pointerId !== pointerIdRef.current || !draftRef.current) return
      const stroke = {
        points: [
          ...draftRef.current.points,
          pointOnCanvas(event.currentTarget, event.clientX, event.clientY)
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
  }

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (isEditableTarget(event.target)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        void finish()
        return
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    },
    [finish, redo, undo]
  )

  useLayoutEffect(() => {
    if (!session) return
    redraw(historyRef.current.present)
    canvasRef.current?.focus()
  }, [redraw, session])

  useEffect(() => {
    if (!session) return
    const target = targetRef.current
    if (!target) {
      cancel()
      return
    }

    const observer = new ResizeObserver(entries => {
      const bounds = entries[0]?.contentRect
      if (!bounds) return
      if (
        Math.abs(bounds.width - session.targetWidth) > 1 ||
        Math.abs(bounds.height - session.targetHeight) > 1
      ) {
        cancel()
      }
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [cancel, session])

  useEffect(
    () => () => {
      lifecycleRevisionRef.current += 1
      sessionRef.current = null
    },
    []
  )

  const controls: AnnotationControls = {
    active: session !== null,
    starting,
    finishing,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    hasStrokes: history.present.length > 0,
    open,
    undo,
    redo,
    clear,
    finish,
    cancel
  }

  return {
    targetRef,
    controls,
    layerProps: {
      active: controls.active,
      canvasRef,
      width: session?.snapshot.width ?? 0,
      height: session?.snapshot.height ?? 0,
      pointerProps,
      onKeyDown
    }
  }
}
