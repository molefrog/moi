import { useCallback, useEffect, useRef } from 'react'

import { toast } from '@/client/components/ui/toast'
import { stageAnnotation, stageAnnotationDraft } from '@/client/features/chat/attachment-staging'
import { liveStore } from '@/client/features/chat/chat-store'
import type { LayoutMode, WorkspaceTabId } from '@/lib/types'

import type { ChatAnnotationControls } from './types'
import { type AnnotationController, useAnnotationLayer } from './useAnnotationLayer'

type AnnotationOrigin = 'docked' | 'popup'

type ChatAnnotationDraft = {
  workspaceId: string
  sourceSessionId: string | null
  sourceTab: WorkspaceTabId
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

export type ChatAnnotationController = AnnotationController & {
  docked: ChatAnnotationControls | undefined
  popup: ChatAnnotationControls | undefined
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
  const latestBlobRef = useRef<Blob | null>(null)
  const uploadRevisionsRef = useRef(new Map<string, number>())
  const closePopupRef = useRef(closePopup)
  const openPopupRef = useRef(openPopup)
  closePopupRef.current = closePopup
  openPopupRef.current = openPopup

  // While drawing, every commit only refreshes the chip's local preview. The
  // single upload happens when the session ends: finish/send (complete) or an
  // implicit cancel that keeps the attachment.
  const change = useCallback((blob: Blob | null) => {
    const draft = draftRef.current
    if (!draft) return

    latestBlobRef.current = blob
    if (!blob) {
      liveStore
        .getState()
        .removeAttachment(draft.workspaceId, draft.sourceSessionId, draft.attachmentId)
      return
    }

    stageAnnotationDraft({
      workspaceId: draft.workspaceId,
      sessionId: draft.sourceSessionId,
      localId: draft.attachmentId,
      sourceTab: draft.sourceTab,
      blob
    })
  }, [])

  const upload = useCallback((draft: ChatAnnotationDraft, blob: Blob): Promise<void> => {
    const revision = (uploadRevisionsRef.current.get(draft.attachmentId) ?? 0) + 1
    uploadRevisionsRef.current.set(draft.attachmentId, revision)
    return stageAnnotation({
      workspaceId: draft.workspaceId,
      sessionId: draft.sourceSessionId,
      localId: draft.attachmentId,
      sourceTab: draft.sourceTab,
      blob,
      isCurrent: () => uploadRevisionsRef.current.get(draft.attachmentId) === revision
    })
  }, [])

  const complete = useCallback(
    async (blob: Blob | null) => {
      const draft = draftRef.current
      draftRef.current = null
      latestBlobRef.current = null
      // Awaited so a send that finishes the drawing only dispatches once the
      // attachment is uploaded and ready.
      if (draft && blob) await upload(draft, blob)
      if (draft?.origin === 'popup') openPopupRef.current()
    },
    [upload]
  )

  const annotation = useAnnotationLayer({ onChange: change, onFinish: complete })
  const { controls } = annotation
  const { active, starting, open, finish, cancel: cancelLayer } = controls

  const start = useCallback(
    async (origin: AnnotationOrigin) => {
      if (!available || active || starting) return

      const draft: ChatAnnotationDraft = {
        workspaceId,
        sourceSessionId: sessionId,
        sourceTab: activeTab,
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
    [active, activeTab, available, open, sessionId, starting, workspaceId]
  )

  const cancel = useCallback(async () => {
    const draft = draftRef.current
    await cancelLayer()
    if (draftRef.current !== draft) return
    draftRef.current = null
    const blob = latestBlobRef.current
    latestBlobRef.current = null
    // An implicit cancel (tab/session switch) keeps the drawn-so-far
    // annotation as an attachment, so it gets its one deferred upload here.
    if (draft && blob) void upload(draft, blob)
  }, [cancelLayer, upload])

  const remove = useCallback(
    (localId: string) => {
      const revision = (uploadRevisionsRef.current.get(localId) ?? 0) + 1
      uploadRevisionsRef.current.set(localId, revision)
      if (draftRef.current?.attachmentId === localId) {
        draftRef.current = null
        latestBlobRef.current = null
        void cancelLayer()
      }
    },
    [cancelLayer]
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
      draft.sourceTab !== activeTab ||
      mode !== expectedMode ||
      !available
    ) {
      void cancel()
    }
  }, [activeTab, available, cancel, mode, sessionId, workspaceId])

  const commonControls = {
    active: active || starting,
    finish: finishDrawing,
    onRemove: remove
  }

  return {
    ...annotation,
    docked: available
      ? {
          ...commonControls,
          onToggle: toggleDocked
        }
      : undefined,
    popup: available
      ? {
          ...commonControls,
          onToggle: togglePopup
        }
      : undefined
  }
}
