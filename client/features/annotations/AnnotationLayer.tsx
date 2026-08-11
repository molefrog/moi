import type { KeyboardEventHandler, PointerEventHandler, ReactNode, RefObject } from 'react'

export type AnnotationCanvasPointerProps = {
  onPointerDown: PointerEventHandler<HTMLCanvasElement>
  onPointerMove: PointerEventHandler<HTMLCanvasElement>
  onPointerUp: PointerEventHandler<HTMLCanvasElement>
  onPointerCancel: PointerEventHandler<HTMLCanvasElement>
}

export type AnnotationLayerProps = {
  active: boolean
  canvasRef: RefObject<HTMLCanvasElement | null>
  width: number
  height: number
  pointerProps: AnnotationCanvasPointerProps
  onKeyDown: KeyboardEventHandler<HTMLDivElement>
  children?: ReactNode
}

// The layer only renders the drawing canvas and an optional controls slot. All
// capture, history, and export behavior belongs to useAnnotationLayer.
export function AnnotationLayer({
  active,
  canvasRef,
  width,
  height,
  pointerProps,
  onKeyDown,
  children
}: AnnotationLayerProps) {
  if (!active) return null

  return (
    <div className="absolute inset-0 animate-in duration-100 fade-in" onKeyDown={onKeyDown}>
      <canvas
        ref={canvasRef}
        {...pointerProps}
        width={width}
        height={height}
        aria-label="Annotation drawing area"
        tabIndex={0}
        className="absolute inset-0 size-full cursor-pencil touch-none outline-none"
      />
      {children}
    </div>
  )
}
