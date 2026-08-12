import type { KeyboardEventHandler, PointerEventHandler, ReactNode, RefObject } from 'react'

export type DrawingCanvasPointerProps = {
  onPointerDown: PointerEventHandler<HTMLCanvasElement>
  onPointerMove: PointerEventHandler<HTMLCanvasElement>
  onPointerUp: PointerEventHandler<HTMLCanvasElement>
  onPointerCancel: PointerEventHandler<HTMLCanvasElement>
}

export type DrawingLayerProps = {
  visible: boolean
  editing: boolean
  canvasRef: RefObject<HTMLCanvasElement | null>
  width: number
  height: number
  pointerProps: DrawingCanvasPointerProps
  onKeyDown: KeyboardEventHandler<HTMLDivElement>
  children?: ReactNode
}

// The layer only renders the drawing canvas and an optional controls slot. All
// capture, history, and export behavior belongs to useDrawingLayer.
export function DrawingLayer({
  visible,
  editing,
  canvasRef,
  width,
  height,
  pointerProps,
  onKeyDown,
  children
}: DrawingLayerProps) {
  if (!visible) return null

  return (
    <div className="absolute inset-0 animate-in duration-100 fade-in" onKeyDown={onKeyDown}>
      <canvas
        ref={canvasRef}
        {...pointerProps}
        width={width}
        height={height}
        aria-label="Drawing area"
        tabIndex={0}
        className="absolute inset-0 size-full cursor-pencil touch-none outline-none"
      />
      {editing && children}
    </div>
  )
}
