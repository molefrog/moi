import { forwardRef, useImperativeHandle } from 'react'

import { Button } from '@/client/components/ui/button'
import { Spinner } from '@/client/components/ui/spinner'
import { DrawingLayer } from '@/client/features/drawings/DrawingLayer'
import { SketchToolbar } from '@/client/features/drawings/SketchToolbar'
import { useViewBuilderSketch } from '@/client/features/drawings/useViewBuilderSketch'
import { cn } from '@/client/lib/cn'
import type { ViewBuilder } from '@/lib/types'
import { viewBuilderTabId } from '@/lib/workspace-tabs'

export type ViewBuilderTabHandle = {
  prepareSketchForSend: () => Promise<void>
  resetSketch: () => Promise<void>
}

type ViewBuilderTabProps = {
  active: boolean
  builder: ViewBuilder
  workspaceId: string
  onEditingStart: () => void
  onContinueInChat: () => void
  onOpenChat: () => void
  onDiscard: () => void
}

export const ViewBuilderTab = forwardRef<ViewBuilderTabHandle, ViewBuilderTabProps>(
  function ViewBuilderTab(
    { active, builder, workspaceId, onEditingStart, onContinueInChat, onOpenChat, onDiscard },
    ref
  ) {
    const sketch = useViewBuilderSketch({
      active: active && builder.status === 'draft',
      builderId: builder.id,
      sessionId: builder.sessionId,
      sourceTab: viewBuilderTabId(builder.id),
      workspaceId,
      onEditingStart,
      onContinueInChat
    })

    useImperativeHandle(
      ref,
      () => ({
        prepareSketchForSend: sketch.prepareForSend,
        resetSketch: sketch.resetDocument
      }),
      [sketch.prepareForSend, sketch.resetDocument]
    )

    if (builder.status === 'draft') {
      return (
        <div
          className={cn(
            'relative min-h-0 flex-1 overflow-hidden bg-background',
            active ? 'flex' : 'hidden'
          )}
        >
          <div
            ref={sketch.targetRef}
            className="absolute inset-0 flex items-center justify-center bg-background texture-grid"
          >
            {!sketch.controls.active && !sketch.controls.hasStrokes && (
              <span className="flex h-full w-full items-center justify-center bg-radial from-background from-20% to-transparent to-75% p-4 text-center text-sm text-muted-foreground">
                Sketch how this view should look
              </span>
            )}
          </div>
          <DrawingLayer {...sketch.layerProps}>
            <SketchToolbar
              controls={sketch.controls}
              continuing={sketch.continuing}
              onContinue={() => void sketch.continueInChat()}
            />
          </DrawingLayer>
        </div>
      )
    }

    if (!active) return null

    if (builder.status === 'waiting') {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-medium">The view needs your attention</h1>
              <p className="text-sm text-muted-foreground">
                {builder.error ?? 'Open its chat to answer or ask the agent to continue.'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={onOpenChat}>Open chat</Button>
              <Button variant="secondary" onClick={onDiscard}>
                Discard
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          {builder.status === 'ready' ? 'Opening view…' : 'Building view…'}
        </div>
      </div>
    )
  }
)
