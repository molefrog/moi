import type { ReactNode, Ref } from 'react'
import { useImperativeHandle } from 'react'

import { Button } from '@/client/components/ui/button'
import { DrawingLayer } from '@/client/features/drawings/DrawingLayer'
import { DrawingToolbar } from '@/client/features/drawings/DrawingToolbar'
import { useDrawingHistoryState } from '@/client/features/drawings/useDrawingLayer'
import {
  type ViewBuilderSketchController,
  useViewBuilderSketch
} from '@/client/features/drawings/useViewBuilderSketch'
import { cn } from '@/client/lib/cn'
import type { ViewBuilder as ViewBuilderData } from '@/lib/types'
import { viewBuilderTabId } from '@/lib/workspace-tabs'
import { IconScribble } from '@tabler/icons-react'

export type ViewBuilderHandle = {
  prepareSketchForSend: () => Promise<void>
  resetSketch: () => Promise<void>
}

type ViewBuilderProps = {
  ref?: Ref<ViewBuilderHandle>
  active: boolean
  builder: ViewBuilderData
  chatDocked: boolean
  workspaceId: string
  onEditingStart: () => void
  onContinueInChat: () => void
  onOpenChat: () => void
  onDiscard: () => void
}

export function ViewBuilder({
  ref,
  active,
  builder,
  chatDocked,
  workspaceId,
  onEditingStart,
  onContinueInChat,
  onOpenChat,
  onDiscard
}: ViewBuilderProps) {
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

  switch (builder.status) {
    case 'ready':
      return null
    case 'draft':
    case 'waiting':
    case 'building':
      return (
        <ViewBuilderSketchSurface
          active={active}
          chatDocked={chatDocked}
          error={builder.error}
          sketch={sketch}
          status={builder.status}
          onDiscard={onDiscard}
          onOpenChat={onOpenChat}
        />
      )
  }
}

type ViewBuilderSketchSurfaceProps = {
  active: boolean
  chatDocked: boolean
  error?: string
  sketch: ViewBuilderSketchController
  status: Exclude<ViewBuilderData['status'], 'ready'>
  onDiscard: () => void
  onOpenChat: () => void
}

function ViewBuilderSketchSurface({
  active,
  chatDocked,
  error,
  sketch,
  status,
  onDiscard,
  onOpenChat
}: ViewBuilderSketchSurfaceProps) {
  const draft = status === 'draft'

  return (
    <div
      className={cn(
        'relative min-h-0 flex-1 overflow-hidden bg-background',
        active ? 'flex' : 'hidden'
      )}
    >
      {draft && <ViewBuilderDraftState chatDocked={chatDocked} sketch={sketch} />}
      <div
        inert={draft ? undefined : true}
        className={cn(
          'absolute inset-0',
          status === 'building' && 'pointer-events-none opacity-50',
          status === 'waiting' && 'invisible'
        )}
      >
        <DrawingLayer {...sketch.layerProps}>
          {draft && (
            <DrawingToolbar
              controls={sketch.controls}
              title="Sketch the view"
              busy={sketch.continuing}
              onComplete={() => void sketch.continueInChat()}
            />
          )}
        </DrawingLayer>
      </div>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 transition-shadow duration-500 ease-in-out',
          status === 'building' &&
            'animate-glow texture-inset-shadow-50% motion-reduce:animate-none'
        )}
      />
      {status === 'building' && <ViewBuilderBuildingState />}
      {status === 'waiting' && (
        <ViewBuilderWaitingState error={error} onDiscard={onDiscard} onOpenChat={onOpenChat} />
      )}
    </div>
  )
}

type ViewBuilderDraftStateProps = {
  chatDocked: boolean
  sketch: ViewBuilderSketchController
}

function ViewBuilderDraftState({ chatDocked, sketch }: ViewBuilderDraftStateProps) {
  const { hasStrokes } = useDrawingHistoryState(sketch.controls)

  return (
    <div
      ref={sketch.targetRef}
      className="absolute inset-0 flex items-center justify-center texture-checker-20"
    >
      {!sketch.controls.active && !hasStrokes && (
        <div
          className={cn(
            'mb-4 flex h-full flex-col items-center justify-center gap-2 p-12 text-center text-sm text-muted-foreground',
            'bg-radial from-background from-10% to-transparent',
            chatDocked ? 'w-full' : 'mr-auto w-[calc(100%-var(--chat-max))]'
          )}
        >
          <IconScribble size={56} stroke={0.5} />
          <span className="max-w-32">Sketch how the view should look</span>
        </div>
      )}
    </div>
  )
}

type ViewBuilderWaitingStateProps = {
  error?: string
  onDiscard: () => void
  onOpenChat: () => void
}

function ViewBuilderWaitingState({ error, onDiscard, onOpenChat }: ViewBuilderWaitingStateProps) {
  return (
    <ViewBuilderStatusLayout>
      <div className="flex max-w-md flex-col items-center gap-4 bg-radial from-background from-50% to-transparent to-75% p-12 text-center">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium">The view needs your attention</h1>
          <p className="text-sm text-muted-foreground">
            {error ?? 'Open the chat to answer or ask the agent to continue'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onOpenChat}>Open chat</Button>
          <Button variant="secondary" onClick={onDiscard}>
            Discard view
          </Button>
        </div>
      </div>
    </ViewBuilderStatusLayout>
  )
}

function ViewBuilderBuildingState() {
  return <ViewBuilderStatusLayout />
}

type ViewBuilderStatusLayoutProps = {
  children?: ReactNode
  className?: string
}

function ViewBuilderStatusLayout({ children, className }: ViewBuilderStatusLayoutProps) {
  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-1 items-center justify-center texture-checker-20',
        className
      )}
    >
      {children}
    </div>
  )
}
