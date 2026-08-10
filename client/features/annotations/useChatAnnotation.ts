import { useCallback, useEffect, useRef } from 'react'

import { toast } from '@/client/components/ui/toast'
import { stageAnnotation } from '@/client/features/chat/attachment-staging'
import {
  attachmentKey,
  type ChatAttachment,
  liveStore,
  useLive
} from '@/client/features/chat/chat-store'
import type { LayoutMode, WorkspaceTabId } from '@/lib/types'

import type { AnnotationDocument, ChatAnnotationControls } from './types'
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

type AnnotationAttachment = Extract<ChatAttachment, { kind: 'annotation' }>

export function findComposerAnnotation(
  attachments: readonly ChatAttachment[]
): AnnotationAttachment | undefined {
  return attachments.find(
    (attachment): attachment is AnnotationAttachment => attachment.kind === 'annotation'
  )
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
  const attachedAnnotation = useLive(state =>
    findComposerAnnotation(state.attachments[attachmentKey(workspaceId, sessionId)] ?? [])
  )
  const attachedAnnotationRef = useRef(attachedAnnotation)
  const uploadRevisionsRef = useRef(new Map<string, number>())
  const closePopupRef = useRef(closePopup)
  const openPopupRef = useRef(openPopup)
  closePopupRef.current = closePopup
  openPopupRef.current = openPopup
  attachedAnnotationRef.current = attachedAnnotation

  const change = useCallback((blob: Blob | null, document: AnnotationDocument) => {
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
      document,
      blob,
      isCurrent: () => uploadRevisionsRef.current.get(draft.attachmentId) === revision
    })
  }, [])

  const complete = useCallback(() => {
    const draft = draftRef.current
    if (draft?.origin === 'popup') openPopupRef.current()
  }, [])

  const annotation = useAnnotationLayer({ onChange: change, onFinish: complete })
  const { controls } = annotation
  const { active, starting, open, finish, reset } = controls

  const start = useCallback(
    async (origin: AnnotationOrigin) => {
      if (!available || active || starting) return

      const existing = attachedAnnotationRef.current
      if (existing && existing.sourceTab !== activeTab) {
        toast.add({
          title: 'Open the annotation’s original tab to keep drawing',
          type: 'error'
        })
        return
      }

      const draft: ChatAnnotationDraft = {
        workspaceId,
        sourceSessionId: sessionId,
        sourceTab: activeTab,
        origin,
        attachmentId: existing?.localId ?? crypto.randomUUID()
      }
      draftRef.current = draft
      try {
        const opened = await open(existing?.document ?? null)
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

  const discard = useCallback(() => {
    reset()
    draftRef.current = null
  }, [reset])

  const remove = useCallback(
    (localId: string) => {
      const revision = (uploadRevisionsRef.current.get(localId) ?? 0) + 1
      uploadRevisionsRef.current.set(localId, revision)
      if (draftRef.current?.attachmentId === localId) discard()
    },
    [discard]
  )

  const toggleDocked = useCallback(() => {
    if (active) void finish()
    else void start('docked')
  }, [active, finish, start])
  const togglePopup = useCallback(() => {
    if (active) void finish()
    else void start('popup')
  }, [active, finish, start])
  const finishDrawing = useCallback(() => {
    void finish()
  }, [finish])

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
      discard()
    }
  }, [activeTab, available, discard, mode, sessionId, workspaceId])

  useEffect(() => {
    const draft = draftRef.current
    if (!draft || active || starting || attachedAnnotation?.localId === draft.attachmentId) return
    discard()
  }, [active, attachedAnnotation?.localId, discard, starting])

  const commonControls = {
    active,
    starting,
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
