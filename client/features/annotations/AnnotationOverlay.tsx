import {
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState
} from 'react'

import { IconArrowBackUp, IconArrowForwardUp, IconX } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { cn } from '@/client/lib/cn'

import { useAnnotationEditor } from './useAnnotationEditor'
import type { AnnotationOverlayHandle, ChatAnnotationController } from './types'

type AnnotationOverlayProps = {
  ref?: Ref<AnnotationOverlayHandle>
  snapshot: HTMLCanvasElement
  strokeColor: string
  haloColor: string
  onChange: (blob: Blob | null) => void
  onDone: () => void
}

export function AnnotationOverlay({
  ref,
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

  useImperativeHandle(ref, () => ({ finish }), [finish])

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
        <span className="mr-2 ml-2 text-sm font-medium">Draw annotation</span>
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

// The chat-facing surface keeps capture and overlay wiring out of workspace composition.
type ChatAnnotationSurfaceProps = {
  controller: ChatAnnotationController
  children: ReactNode
  className?: string
  contentClassName?: string
}

export function ChatAnnotationSurface({
  controller,
  children,
  className,
  contentClassName
}: ChatAnnotationSurfaceProps) {
  const { targetRef, overlayRef, session, change, complete } = controller.surface

  return (
    <div className={cn('relative', className)}>
      <div
        ref={targetRef}
        inert={session ? true : undefined}
        aria-hidden={session ? true : undefined}
        className={contentClassName}
      >
        {children}
      </div>

      {session && (
        <AnnotationOverlay
          ref={overlayRef}
          key={session.id}
          snapshot={session.snapshot}
          strokeColor={session.strokeColor}
          haloColor={session.haloColor}
          onChange={blob => change(session, blob)}
          onDone={complete}
        />
      )}
    </div>
  )
}
