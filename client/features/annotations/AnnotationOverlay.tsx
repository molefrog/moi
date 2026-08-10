import { useCallback, useEffect, useState } from 'react'

import { IconArrowBackUp, IconArrowForwardUp, IconX } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'

import { useAnnotationEditor } from './useAnnotationEditor'

type AnnotationOverlayProps = {
  snapshot: HTMLCanvasElement
  strokeColor: string
  haloColor: string
  onChange: (blob: Blob | null) => void
  onDone: () => void
}

export function AnnotationOverlay({
  snapshot,
  strokeColor,
  haloColor,
  onChange,
  onDone
}: AnnotationOverlayProps) {
  const editor = useAnnotationEditor({ snapshot, strokeColor, haloColor, onChange })
  const [finishing, setFinishing] = useState(false)

  const finish = useCallback(() => {
    if (finishing) return
    setFinishing(true)
    editor.cancelStroke()
    void editor.flush().then(onDone)
  }, [editor, finishing, onDone])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish()
        return
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      event.preventDefault()
      if (event.shiftKey) editor.redo()
      else editor.undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editor, finish])

  return (
    <div className="absolute inset-0 z-20 animate-in duration-100 fade-in">
      <canvas
        ref={editor.canvasRef}
        {...editor.pointerProps}
        aria-label="Annotation drawing area"
        tabIndex={0}
        className="absolute inset-0 size-full cursor-crosshair touch-none outline-none"
      />

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-popover p-1.5 shadow-md">
        <span className="mr-2 ml-2 text-sm font-medium">Annotate</span>
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={editor.undo}
                  disabled={finishing || !editor.canUndo}
                  aria-label="Undo annotation"
                >
                  <IconArrowBackUp stroke={1.75} />
                </Button>
              }
            />
            <TooltipContent>Undo</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={editor.redo}
                  disabled={finishing || !editor.canRedo}
                  aria-label="Redo annotation"
                >
                  <IconArrowForwardUp stroke={1.75} />
                </Button>
              }
            />
            <TooltipContent>Redo</TooltipContent>
          </Tooltip>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={editor.clear}
            disabled={finishing || !editor.hasStrokes}
          >
            Clear
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={finish}
          disabled={finishing}
          className="text-muted-foreground"
        >
          <IconX stroke={1.75} />
        </Button>
      </div>
    </div>
  )
}
