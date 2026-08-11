import { useCallback, useEffect, useRef, useState } from 'react'

import { stageDrawing } from '@/client/features/chat/attachment-staging'
import { liveStore } from '@/client/features/chat/chat-store'
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
  const pendingStageRef = useRef<Promise<void> | null>(null)
  const acceptExportsRef = useRef(true)
  const [continuing, setContinuing] = useState(false)
  const onEditingStartRef = useRef(onEditingStart)
  const onContinueInChatRef = useRef(onContinueInChat)
  onEditingStartRef.current = onEditingStart
  onContinueInChatRef.current = onContinueInChat

  const change = useCallback(
    (blob: Blob | null) => {
      if (!acceptExportsRef.current) return
      const revision = ++uploadRevisionRef.current
      if (!blob) {
        pendingStageRef.current = null
        liveStore.getState().removeAttachment(workspaceId, sessionId, attachmentIdRef.current)
        return
      }

      pendingStageRef.current = stageDrawing({
        workspaceId,
        sessionId,
        localId: attachmentIdRef.current,
        purpose: 'sketch',
        sourceTab,
        blob,
        isCurrent: () => uploadRevisionRef.current === revision
      })
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
    await controls.flush()
    await pendingStageRef.current
  }, [controls])

  const deactivate = useCallback(async () => {
    await controls.deactivate()
    await pendingStageRef.current
  }, [controls])

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
