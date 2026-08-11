import { IconArrowBackUp, IconArrowForwardUp, IconCheck, IconX } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { cn } from '@/client/lib/cn'

import { type AnnotationControls, useAnnotationHistoryState } from './useAnnotationLayer'

type AnnotationToolbarProps = {
  controls: AnnotationControls
}

export function AnnotationToolbar({ controls }: AnnotationToolbarProps) {
  // Subscribed here so a stroke commit re-renders only this toolbar, not the
  // screen that owns the annotation hook.
  const { canUndo, canRedo, hasStrokes } = useAnnotationHistoryState(controls)

  return (
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
                onClick={controls.undo}
                disabled={controls.finishing || !canUndo}
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
                onClick={controls.redo}
                disabled={controls.finishing || !canRedo}
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
          onClick={controls.clear}
          disabled={controls.finishing || !hasStrokes}
        >
          Clear
        </Button>
      </div>
      <Button
        type="button"
        variant={hasStrokes ? 'default' : 'ghost'}
        size="icon-sm"
        onClick={() => void controls.finish()}
        disabled={controls.finishing}
        aria-label="Finish annotation"
        className={cn(!hasStrokes && 'text-muted-foreground')}
      >
        {hasStrokes ? <IconCheck stroke={1.75} /> : <IconX stroke={1.75} />}
      </Button>
    </div>
  )
}
