import { useCallback, useEffect, useRef, useState } from 'react'

import { stageDrawing, stageDrawingDraft } from '@/client/features/chat/attachment-staging'
import { attachmentKey, liveStore } from '@/client/features/chat/chat-store'
import type { WorkspaceTabId } from '@/lib/types'

import { useDrawingLayer } from './useDrawingLayer'

type UseViewBuilderSketchOptions = {
  active: boolean
  builderId: string
  sessionId: string
  sourceTab: WorkspaceTabId
  workspaceId: string
  onEditingStart: () => void
  onContinueInChat: () => void
}

export type ViewBuilderSketchController = ReturnType<typeof useViewBuilderSketch>

export function useViewBuilderSketch({
  active,
  builderId,
  sessionId,
  sourceTab,
  workspaceId,
  onEditingStart,
  onContinueInChat
}: UseViewBuilderSketchOptions) {
  const attachmentIdRef = useRef(`sketch:${builderId}`)
  const uploadRevisionRef = useRef(0)
  const uploadedBlobRef = useRef<Blob | null>(null)
  const pendingStageRef = useRef<Promise<void> | null>(null)
  const acceptExportsRef = useRef(true)
  const [continuing, setContinuing] = useState(false)
  const onEditingStartRef = useRef(onEditingStart)
  const onContinueInChatRef = useRef(onContinueInChat)
  onEditingStartRef.current = onEditingStart
  onContinueInChatRef.current = onContinueInChat

  // While drawing, every commit only refreshes the chip's local preview. The
  // single upload happens when the sketching session ends: prepareForSend
  // (submit) or deactivate (tab switch, continue in chat).
  const change = useCallback(
    (blob: Blob | null) => {
      if (!acceptExportsRef.current) return
      if (!blob) {
        uploadRevisionRef.current += 1
        uploadedBlobRef.current = null
        pendingStageRef.current = null
        liveStore.getState().removeAttachment(workspaceId, sessionId, attachmentIdRef.current)
        return
      }

      stageDrawingDraft({
        workspaceId,
        sessionId,
        localId: attachmentIdRef.current,
        purpose: 'sketch',
        sourceTab,
        blob
      })
    },
    [sessionId, sourceTab, workspaceId]
  )

  // Exports are cached per history version, so an unchanged sketch comes back
  // as the same Blob instance — the identity check is what makes repeated
  // deactivations free instead of re-uploading the same image. A failed
  // upload removes the attachment, so "same blob but not staged" retries.
  const uploadIfNeeded = useCallback(
    (blob: Blob | null): Promise<void> => {
      if (!blob) return pendingStageRef.current ?? Promise.resolve()
      if (blob === uploadedBlobRef.current) {
        const staged = liveStore
          .getState()
          .attachments[attachmentKey(workspaceId, sessionId)]?.some(
            attachment =>
              attachment.localId === attachmentIdRef.current &&
              (attachment.status === 'ready' || attachment.status === 'uploading')
          )
        if (staged) return pendingStageRef.current ?? Promise.resolve()
      }
      uploadedBlobRef.current = blob
      const revision = ++uploadRevisionRef.current
      const pending = stageDrawing({
        workspaceId,
        sessionId,
        localId: attachmentIdRef.current,
        purpose: 'sketch',
        sourceTab,
        blob,
        isCurrent: () => uploadRevisionRef.current === revision
      })
      pendingStageRef.current = pending
      return pending
    },
    [sessionId, sourceTab, workspaceId]
  )

  const drawing = useDrawingLayer({
    mode: 'sketch',
    onChange: change,
    onEditingStart: () => onEditingStartRef.current()
  })
  const { controls } = drawing

  const prepareForSend = useCallback(async () => {
    await uploadIfNeeded(await controls.flush())
  }, [controls, uploadIfNeeded])

  const deactivate = useCallback(async () => {
    await uploadIfNeeded(await controls.deactivate())
  }, [controls, uploadIfNeeded])

  const continueInChat = useCallback(async () => {
    if (continuing) return
    setContinuing(true)
    try {
      await deactivate()
      onContinueInChatRef.current()
    } finally {
      setContinuing(false)
    }
  }, [continuing, deactivate])

  const resetDocument = useCallback(async () => {
    acceptExportsRef.current = false
    uploadRevisionRef.current += 1
    uploadedBlobRef.current = null
    pendingStageRef.current = null
    liveStore.getState().removeAttachment(workspaceId, sessionId, attachmentIdRef.current)
    try {
      await controls.cancel()
    } finally {
      acceptExportsRef.current = true
    }
  }, [controls, sessionId, workspaceId])

  useEffect(() => {
    if (!active && controls.active) void deactivate()
  }, [active, controls.active, deactivate])

  return {
    ...drawing,
    continuing,
    continueInChat,
    prepareForSend,
    resetDocument
  }
}
