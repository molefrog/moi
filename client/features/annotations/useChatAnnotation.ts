import { useCallback, useEffect, useRef } from 'react'

import { toast } from '@/client/components/ui/toast'
import { stageAnnotation } from '@/client/features/chat/attachment-staging'
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
  const uploadRevisionsRef = useRef(new Map<string, number>())
  const closePopupRef = useRef(closePopup)
  const openPopupRef = useRef(openPopup)
  closePopupRef.current = closePopup
  openPopupRef.current = openPopup

  const change = useCallback((blob: Blob | null) => {
    const draft = draftRef.current
    if (!draft) return

    const revision = (uploadRevisionsRef.current.get(draft.attachmentId) ?? 0) + 1
    uploadRevisionsRef.current.set(draft.attachmentId, revision)
    if (!blob) {
      liveStore
        .getState()
        .removeAttachment(draft.workspaceId, draft.sourceSessionId, draft.attachmentId)
      return
    }

    void stageAnnotation({
      workspaceId: draft.workspaceId,
      sessionId: draft.sourceSessionId,
      localId: draft.attachmentId,
      sourceTab: draft.sourceTab,
      blob,
      isCurrent: () => uploadRevisionsRef.current.get(draft.attachmentId) === revision
    })
  }, [])

  const complete = useCallback(() => {
    const draft = draftRef.current
    draftRef.current = null
    if (draft?.origin === 'popup') openPopupRef.current()
  }, [])

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
        if (draftRef.current === draft) draftRef.current = null
        toast.add({ title: 'Couldn’t capture this page', type: 'error' })
      }
    },
    [active, activeTab, available, open, sessionId, starting, workspaceId]
  )

  const cancel = useCallback(() => {
    cancelLayer()
    draftRef.current = null
  }, [cancelLayer])

  const remove = useCallback(
    (localId: string) => {
      const revision = (uploadRevisionsRef.current.get(localId) ?? 0) + 1
      uploadRevisionsRef.current.set(localId, revision)
      if (draftRef.current?.attachmentId === localId) cancel()
    },
    [cancel]
  )

  const toggleDocked = useCallback(() => {
    if (active) void finish()
    else void start('docked')
  }, [active, finish, start])
  const togglePopup = useCallback(() => {
    if (active) void finish()
    else void start('popup')
  }, [active, finish, start])

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
      cancel()
    }
  }, [activeTab, available, cancel, mode, sessionId, workspaceId])

  const commonControls = {
    active,
    starting,
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
