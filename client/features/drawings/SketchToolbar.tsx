import { IconArrowBackUp, IconArrowForwardUp, IconX } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'

import { type DrawingControls, useDrawingHistoryState } from './useDrawingLayer'

type SketchToolbarProps = {
  controls: DrawingControls
  continuing: boolean
  onContinue: () => void
}

export function SketchToolbar({ controls, continuing, onContinue }: SketchToolbarProps) {
  const { canUndo, canRedo, hasStrokes } = useDrawingHistoryState(controls)

  return (
    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-popover p-1.5 shadow-md">
      <span className="mr-2 ml-2 text-sm font-medium">Sketch view layout</span>
      <div className="flex gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={controls.undo}
                disabled={continuing || !canUndo}
                aria-label="Undo sketch"
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
                disabled={continuing || !canRedo}
                aria-label="Redo sketch"
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
          onClick={controls.reset}
          disabled={continuing || !hasStrokes}
        >
          Clear
        </Button>
      </div>
      {hasStrokes ? (
        <Button type="button" size="sm" onClick={onContinue} disabled={continuing}>
          Continue in chat
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onContinue}
          disabled={continuing}
          aria-label="Continue in chat"
          className="text-muted-foreground"
        >
          <IconX stroke={1.75} />
        </Button>
      )}
    </div>
  )
}
