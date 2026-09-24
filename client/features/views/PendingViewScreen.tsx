import type { ReactNode, Ref } from 'react'
import { useImperativeHandle } from 'react'

import { Button } from '@/client/components/ui/button'
import { Spinner } from '@/client/components/ui/spinner'
import { DrawingLayer } from '@/client/features/drawings/DrawingLayer'
import { DrawingToolbar } from '@/client/features/drawings/DrawingToolbar'
import {
  type DrawingControls,
  useDrawingHistoryState
} from '@/client/features/drawings/useDrawingLayer'
import { type ViewSketchController, useViewSketch } from '@/client/features/drawings/useViewSketch'
import { cn } from '@/client/lib/cn'
import type { PendingView } from '@/lib/types'
import { draftSessionId } from '@/lib/session-drafts'
import { viewTabId } from '@/lib/workspace-tabs'
import { IconScribble } from '@tabler/icons-react'

export type PendingViewHandle = {
  prepareSketchForSend: () => Promise<void>
  resetSketch: () => Promise<void>
}

type PendingViewScreenProps = {
  ref?: Ref<PendingViewHandle>
  active: boolean
  pendingView: PendingView
  running: boolean
  sketchSessionId?: string
  chatDocked: boolean
  workspaceId: string
  onEditingStart: () => void
  onContinueInChat: () => void
  onOpenChat: () => void
  onDiscard: () => void
}

export function PendingViewScreen({
  ref,
  active,
  pendingView,
  running,
  sketchSessionId,
  chatDocked,
  workspaceId,
  onEditingStart,
  onContinueInChat,
  onOpenChat,
  onDiscard
}: PendingViewScreenProps) {
  const displayStatus =
    pendingView.status === 'submitted' ? (running ? 'building' : 'waiting') : pendingView.status
  const sketch = useViewSketch({
    active: active && pendingView.status === 'draft',
    viewId: pendingView.id,
    sessionId:
      sketchSessionId ??
      pendingView.executionSessionId ??
      draftSessionId(viewTabId(pendingView.id)),
    source: viewTabId(pendingView.id),
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

  return (
    <PendingViewScreenSketchSurface
      active={active}
      chatDocked={chatDocked}
      error={pendingView.error}
      sketch={sketch}
      displayStatus={displayStatus}
      onDiscard={onDiscard}
      onOpenChat={onOpenChat}
    />
  )
}

function PendingViewScreenStarting() {
  return (
    <PendingViewScreenStatusLayout>
      <div className="flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <Spinner className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Starting view chat…</p>
      </div>
    </PendingViewScreenStatusLayout>
  )
}

type PendingViewScreenFailedProps = {
  error?: string
  onOpenChat: () => void
  onDiscard: () => void
}

function PendingViewScreenFailed({ error, onOpenChat, onDiscard }: PendingViewScreenFailedProps) {
  return (
    <PendingViewScreenStatusLayout>
      <div className="pointer-events-auto flex max-w-md flex-col items-center gap-4 bg-radial from-background from-50% to-transparent to-75% p-8 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button onClick={onOpenChat}>Open chat</Button>
        <Button variant="secondary" onClick={onDiscard}>
          Discard view
        </Button>
      </div>
    </PendingViewScreenStatusLayout>
  )
}

type PendingViewScreenSketchSurfaceProps = {
  active: boolean
  chatDocked: boolean
  error?: string
  sketch: ViewSketchController
  displayStatus: 'draft' | 'starting' | 'building' | 'waiting' | 'failed'
  onDiscard: () => void
  onOpenChat: () => void
}

function PendingViewScreenSketchSurface({
  active,
  chatDocked,
  error,
  sketch,
  displayStatus,
  onDiscard,
  onOpenChat
}: PendingViewScreenSketchSurfaceProps) {
  const draft = displayStatus === 'draft'

  return (
    <div
      className={cn(
        'relative min-h-0 flex-1 overflow-hidden bg-background',
        active ? 'flex' : 'hidden'
      )}
    >
      <PendingViewScreenSketchBackground chatDocked={chatDocked} sketch={sketch} draft={draft} />
      <div
        inert={draft ? undefined : true}
        className={cn('absolute inset-0', !draft && 'pointer-events-none opacity-50')}
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
          displayStatus === 'building' &&
            'animate-glow texture-inset-shadow-50% motion-reduce:animate-none'
        )}
      />
      {displayStatus === 'building' && (
        <PendingViewScreenBuildingState controls={sketch.controls} />
      )}
      {displayStatus === 'starting' && <PendingViewScreenStarting />}
      {displayStatus === 'waiting' && (
        <PendingViewScreenWaitingState
          error={error}
          onDiscard={onDiscard}
          onOpenChat={onOpenChat}
        />
      )}
      {displayStatus === 'failed' && (
        <PendingViewScreenFailed error={error} onOpenChat={onOpenChat} onDiscard={onDiscard} />
      )}
    </div>
  )
}

type PendingViewScreenSketchBackgroundProps = {
  chatDocked: boolean
  sketch: ViewSketchController
  draft: boolean
}

function PendingViewScreenSketchBackground({
  chatDocked,
  sketch,
  draft
}: PendingViewScreenSketchBackgroundProps) {
  const { controls, targetRef } = sketch
  const { hasStrokes } = useDrawingHistoryState(controls)

  return (
    <div
      ref={targetRef}
      className="absolute inset-0 flex items-center justify-center texture-checker-20"
    >
      {draft && !controls.active && !hasStrokes && (
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

type PendingViewScreenWaitingStateProps = {
  error?: string
  onDiscard: () => void
  onOpenChat: () => void
}

function PendingViewScreenWaitingState({
  error,
  onDiscard,
  onOpenChat
}: PendingViewScreenWaitingStateProps) {
  return (
    <PendingViewScreenStatusLayout>
      <div className="pointer-events-auto flex max-w-md flex-col items-center gap-4 bg-radial from-background from-50% to-transparent to-75% p-12 text-center">
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
    </PendingViewScreenStatusLayout>
  )
}

type PendingViewScreenBuildingStateProps = {
  controls: DrawingControls
}

function PendingViewScreenBuildingState({ controls }: PendingViewScreenBuildingStateProps) {
  const { hasStrokes } = useDrawingHistoryState(controls)

  return (
    <PendingViewScreenStatusLayout>
      {!hasStrokes && <Spinner className="size-6 text-muted-foreground" />}
    </PendingViewScreenStatusLayout>
  )
}

type PendingViewScreenStatusLayoutProps = {
  children: ReactNode
}

function PendingViewScreenStatusLayout({ children }: PendingViewScreenStatusLayoutProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {children}
    </div>
  )
}
