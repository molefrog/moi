import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

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
  for (const point of stroke.points.slice(1)) {
    context.lineTo(point.x, point.y)
  }

  if (stroke.points.length === 1) {
    context.lineTo(first.x + 0.01, first.y + 0.01)
  }
  context.stroke()
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Could not export annotation'))
    }, 'image/png')
  })
}

type UseAnnotationEditorOptions = {
  snapshot: HTMLCanvasElement
  strokeColor: string
  haloColor: string
  onChange: (blob: Blob | null) => void
}

export type AnnotationCanvasPointerProps = {
  onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLCanvasElement>) => void
}

export type AnnotationEditor = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  pointerProps: AnnotationCanvasPointerProps
  undo: () => void
  redo: () => void
  clear: () => void
  flush: () => Promise<void>
  cancelStroke: () => void
  canUndo: boolean
  canRedo: boolean
  hasStrokes: boolean
}

export function useAnnotationEditor({
  snapshot,
  strokeColor,
  haloColor,
  onChange
}: UseAnnotationEditorOptions): AnnotationEditor {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const historyRef = useRef<AnnotationHistory>(EMPTY_ANNOTATION_HISTORY)
  const [history, setHistory] = useState<AnnotationHistory>(EMPTY_ANNOTATION_HISTORY)
  const draftRef = useRef<AnnotationStroke | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const exportRevisionRef = useRef(0)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const redraw = useCallback(
    (strokes: AnnotationStroke[], draft: AnnotationStroke | null = null) => {
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return

      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(snapshot, 0, 0, canvas.width, canvas.height)

      const innerWidth = Math.max(3, Math.min(canvas.width, canvas.height) * 0.005)
      const outerWidth = innerWidth + Math.max(2, innerWidth * 0.75)
      const visible = draft ? [...strokes, draft] : strokes
      for (const stroke of visible) drawPath(context, stroke, haloColor, outerWidth)
      for (const stroke of visible) drawPath(context, stroke, strokeColor, innerWidth)
    },
    [haloColor, snapshot, strokeColor]
  )

  const emitChange = async (strokes: AnnotationStroke[]): Promise<void> => {
    const revision = ++exportRevisionRef.current
    if (strokes.length === 0) {
      onChangeRef.current(null)
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const blob = await canvasBlob(canvas)
      if (revision === exportRevisionRef.current) onChangeRef.current(blob)
    } catch {
      // Keep the last committed attachment. The next editor action starts a
      // fresh export.
    }
  }

  const apply = (action: AnnotationHistoryAction) => {
    const next = annotationHistoryReducer(historyRef.current, action)
    if (next === historyRef.current) return
    historyRef.current = next
    setHistory(next)
    draftRef.current = null
    redraw(next.present)
    void emitChange(next.present)
  }

  const cancelStroke = () => {
    if (!draftRef.current) return
    const canvas = canvasRef.current
    const pointerId = pointerIdRef.current
    if (canvas && pointerId !== null && canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId)
    }
    draftRef.current = null
    pointerIdRef.current = null
    redraw(historyRef.current.present)
  }

  const pointerProps: AnnotationCanvasPointerProps = {
    onPointerDown: event => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
      pointerIdRef.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      draftRef.current = {
        points: [pointOnCanvas(event.currentTarget, event.clientX, event.clientY)]
      }
      redraw(historyRef.current.present, draftRef.current)
    },
    onPointerMove: event => {
      if (event.pointerId !== pointerIdRef.current || !draftRef.current) return
      draftRef.current = {
        points: [
          ...draftRef.current.points,
          pointOnCanvas(event.currentTarget, event.clientX, event.clientY)
        ]
      }
      redraw(historyRef.current.present, draftRef.current)
    },
    onPointerUp: event => {
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
    onPointerCancel: event => {
      if (event.pointerId !== pointerIdRef.current) return
      cancelStroke()
    }
  }

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = snapshot.width
    canvas.height = snapshot.height
    redraw([])
    canvas.focus()
  }, [redraw, snapshot])

  useEffect(
    () => () => {
      exportRevisionRef.current += 1
    },
    []
  )

  return {
    canvasRef,
    pointerProps,
    undo: () => apply({ type: 'undo' }),
    redo: () => apply({ type: 'redo' }),
    clear: () => apply({ type: 'clear' }),
    flush: () => emitChange(historyRef.current.present),
    cancelStroke,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    hasStrokes: history.present.length > 0
  }
}
