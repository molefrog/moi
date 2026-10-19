import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import { toast } from '@/client/components/ui/toast'
import {
  stageDrawing,
  stageDrawingDraft
} from '@/client/features/chat/composer/attachments/draft-attachments'
import { liveStore } from '@/client/features/chat/chat-store'
import type { ComposerAnnotationControls } from '@/client/features/chat/composer/ChatComposer'
import { useLatestRef } from '@/client/lib/use-latest-ref'
import type { LayoutMode, WorkspaceTabId } from '@/lib/types'

import { type DrawingController, useDrawingLayer } from './useDrawingLayer'

type AnnotationOrigin = 'docked' | 'popup'

type ChatAnnotationDraft = {
  workspaceId: string
  sourceSessionId: string | null
  source: WorkspaceTabId
  origin: AnnotationOrigin
  attachmentId: string
}

type UseChatAnnotationOptions = {
  workspaceId: string
  sessionId: string | null
  activeTab: WorkspaceTabId
  mode: LayoutMode
  available: boolean
  closePopup: () => void
  openPopup: () => void
}

export type ChatAnnotationController = DrawingController & {
  docked: ComposerAnnotationControls | undefined
  popup: ComposerAnnotationControls | undefined
}

export function useChatAnnotation({
  workspaceId,
  sessionId,
  activeTab,
  mode,
  available,
  closePopup,
  openPopup
}: UseChatAnnotationOptions): ChatAnnotationController {
  const draftRef = useRef<ChatAnnotationDraft | null>(null)
  const uploadRevisionsRef = useRef(new Map<string, number>())
  const closePopupRef = useLatestRef(closePopup)
  const openPopupRef = useLatestRef(openPopup)

  // While drawing, every commit only refreshes the chip's local preview. The
  // single upload happens when the session ends: finish/send (complete) or an
  // implicit cancel that keeps the attachment.
  const change = useCallback((blob: Blob | null) => {
    const draft = draftRef.current
    if (!draft) return

    if (!blob) {
      liveStore.getState().removeAttachment(draft.workspaceId, draft.attachmentId)
      return
    }

    stageDrawingDraft({
      workspaceId: draft.workspaceId,
      sessionId: draft.sourceSessionId,
      localId: draft.attachmentId,
      purpose: 'annotation',
      source: draft.source,
      blob
    })
  }, [])

  const save = useCallback(async (result: Blob | null | Promise<Blob | null>) => {
    const draft = draftRef.current
    if (!draft) return
    // Claim the draft before awaiting export so finish, cancel, and unmount
    // cannot upload it twice.
    draftRef.current = null
    const revision = (uploadRevisionsRef.current.get(draft.attachmentId) ?? 0) + 1
    uploadRevisionsRef.current.set(draft.attachmentId, revision)
    const isCurrent = () => uploadRevisionsRef.current.get(draft.attachmentId) === revision
    const blob = await result
    if (!blob || !isCurrent()) return
    await stageDrawing({
      workspaceId: draft.workspaceId,
      sessionId: draft.sourceSessionId,
      localId: draft.attachmentId,
      purpose: 'annotation',
      source: draft.source,
      blob,
      isCurrent
    })
  }, [])

  const complete = useCallback(
    async (blob: Blob | null) => {
      const draft = draftRef.current
      // Awaited so a send that finishes the drawing only dispatches once the
      // attachment is uploaded and ready.
      await save(blob)
      if (draft?.origin === 'popup') openPopupRef.current()
    },
    [openPopupRef, save]
  )

  const annotation = useDrawingLayer({ onChange: change, onFinish: complete })
  const { controls } = annotation
  const { active, starting, open, finish, flush, cancel: cancelLayer } = controls

  useLayoutEffect(
    () => () => {
      // Capture committed strokes before the drawing layer's passive cleanup
      // clears its session. flush() also waits for an export already in progress.
      if (draftRef.current) void save(flush())
    },
    [flush, save]
  )

  const start = useCallback(
    async (origin: AnnotationOrigin) => {
      if (!available || active || starting) return

      const draft: ChatAnnotationDraft = {
        workspaceId,
        sourceSessionId: sessionId,
        source: activeTab,
        origin,
        attachmentId: crypto.randomUUID()
      }
      draftRef.current = draft
      try {
        const opened = await open()
        if (!opened) {
          if (draftRef.current === draft) draftRef.current = null
          return
        }
        if (origin === 'popup') closePopupRef.current()
      } catch {
        if (draftRef.current !== draft) return
        draftRef.current = null
        toast.add({ title: 'Couldn’t capture this page', type: 'error' })
      }
    },
    [active, activeTab, available, closePopupRef, open, sessionId, starting, workspaceId]
  )

  const cancel = useCallback(async () => {
    const pendingSave = draftRef.current ? save(flush()) : undefined
    await cancelLayer()
    await pendingSave
  }, [cancelLayer, flush, save])

  const remove = useCallback(
    (localId: string) => {
      const revision = (uploadRevisionsRef.current.get(localId) ?? 0) + 1
      uploadRevisionsRef.current.set(localId, revision)
      liveStore.getState().removeAttachment(workspaceId, localId)
      if (draftRef.current?.attachmentId === localId) {
        draftRef.current = null
        void cancelLayer()
      }
    },
    [cancelLayer, workspaceId]
  )

  const finishDrawing = useCallback(async () => {
    if (starting) {
      await cancel()
      return
    }
    await finish()
  }, [cancel, finish, starting])
  const toggleDocked = useCallback(() => {
    if (active || starting) void finishDrawing()
    else void start('docked')
  }, [active, finishDrawing, start, starting])
  const togglePopup = useCallback(() => {
    if (active || starting) void finishDrawing()
    else void start('popup')
  }, [active, finishDrawing, start, starting])

  useEffect(() => {
    const draft = draftRef.current
    if (!draft) return
    const expectedMode = draft.origin === 'docked' ? 'split' : 'fullscreen'
    if (
      draft.workspaceId !== workspaceId ||
      draft.sourceSessionId !== sessionId ||
      draft.source !== activeTab ||
      mode !== expectedMode ||
      !available
    ) {
      void cancel()
    }
  }, [activeTab, available, cancel, mode, sessionId, workspaceId])

  // Identity-stable (all callbacks hold state in refs) so ChatPanel and
  // ChatComposer can be memoized against the `annotation` prop.
  const docked = useMemo<ComposerAnnotationControls | undefined>(
    () =>
      available
        ? {
            active: active || starting,
            finish: finishDrawing,
            onRemove: remove,
            onToggle: toggleDocked
          }
        : undefined,
    [available, active, starting, finishDrawing, remove, toggleDocked]
  )
  const popup = useMemo<ComposerAnnotationControls | undefined>(
    () =>
      available
        ? {
            active: active || starting,
            finish: finishDrawing,
            onRemove: remove,
            onToggle: togglePopup
          }
        : undefined,
    [available, active, starting, finishDrawing, remove, togglePopup]
  )

  return useMemo(() => ({ ...annotation, docked, popup }), [annotation, docked, popup])
}
