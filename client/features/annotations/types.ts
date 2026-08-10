import type { RefObject } from 'react'

import type { WorkspaceTabId } from '@/lib/types'

export type AnnotationOrigin = 'docked' | 'popup'

export type AnnotationOverlayHandle = {
  finish: () => void
}

export type ChatAnnotationSession = {
  id: string
  attachmentId: string
  sourceTab: WorkspaceTabId
  sourceSessionId: string | null
  origin: AnnotationOrigin
  snapshot: HTMLCanvasElement
  strokeColor: string
  haloColor: string
  targetWidth: number
  targetHeight: number
}

export type ChatAnnotationControls = {
  active: boolean
  starting: boolean
  onToggle: () => void
  onRemove: (localId: string) => void
}

export type ChatAnnotationSurfaceController = {
  targetRef: RefObject<HTMLDivElement | null>
  overlayRef: RefObject<AnnotationOverlayHandle | null>
  session: ChatAnnotationSession | null
  change: (session: ChatAnnotationSession, blob: Blob | null) => void
  complete: () => void
}

export type ChatAnnotationController = {
  docked: ChatAnnotationControls | undefined
  popup: ChatAnnotationControls | undefined
  surface: ChatAnnotationSurfaceController
}
