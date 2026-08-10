import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'

import { toast } from '@/client/components/ui/toast'
import { stageAnnotation } from '@/client/features/chat/attachment-staging'
import { liveStore } from '@/client/features/chat/chat-store'
import type { LayoutMode, WorkspaceTabId } from '@/lib/types'

import { captureElement } from './capture-element'

type AnnotationOrigin = 'docked' | 'popup'

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

type UseChatAnnotationOptions = {
  targetRef: RefObject<HTMLElement | null>
  workspaceId: string
  sessionId: string | null
  activeTab: WorkspaceTabId
  mode: LayoutMode
  available: boolean
  closePopup: () => void
  openPopup: () => void
}

export function useChatAnnotation({
  targetRef,
  workspaceId,
  sessionId,
  activeTab,
  mode,
  available,
  closePopup,
  openPopup
}: UseChatAnnotationOptions) {
  const [session, setSession] = useState<ChatAnnotationSession | null>(null)
  const [starting, setStarting] = useState(false)
  const sessionRef = useRef(session)
  const startRevisionRef = useRef(0)
  const uploadRevisionsRef = useRef(new Map<string, number>())
  const closePopupRef = useRef(closePopup)
  const openPopupRef = useRef(openPopup)
  closePopupRef.current = closePopup
  openPopupRef.current = openPopup
  const liveContextRef = useRef({ workspaceId, sessionId, activeTab, mode, available })
  liveContextRef.current = { workspaceId, sessionId, activeTab, mode, available }

  const closeSession = useCallback((reopenPopup: boolean) => {
    const current = sessionRef.current
    sessionRef.current = null
    setSession(null)
    if (reopenPopup && current?.origin === 'popup') openPopupRef.current()
  }, [])

  const start = useCallback(
    async (origin: AnnotationOrigin) => {
      const target = targetRef.current
      if (!target || !liveContextRef.current.available) return

      const revision = ++startRevisionRef.current
      const startContext = liveContextRef.current
      setStarting(true)
      try {
        const snapshot = await captureElement(target)
        const current = liveContextRef.current
        if (
          revision !== startRevisionRef.current ||
          current.workspaceId !== startContext.workspaceId ||
          current.sessionId !== startContext.sessionId ||
          current.activeTab !== startContext.activeTab ||
          current.mode !== startContext.mode ||
          !current.available
        ) {
          return
        }

        const bounds = target.getBoundingClientRect()
        const styles = getComputedStyle(target)
        const next: ChatAnnotationSession = {
          id: crypto.randomUUID(),
          attachmentId: crypto.randomUUID(),
          sourceTab: startContext.activeTab,
          sourceSessionId: startContext.sessionId,
          origin,
          snapshot,
          strokeColor: styles.getPropertyValue('--primary').trim() || '#2563eb',
          haloColor: styles.getPropertyValue('--background').trim() || '#ffffff',
          targetWidth: bounds.width,
          targetHeight: bounds.height
        }
        sessionRef.current = next
        setSession(next)
        if (origin === 'popup') closePopupRef.current()
      } catch {
        if (revision === startRevisionRef.current) {
          toast.add({ title: 'Couldn’t capture this page', type: 'error' })
        }
      } finally {
        if (revision === startRevisionRef.current) setStarting(false)
      }
    },
    [targetRef]
  )

  const change = useCallback(
    (editingSession: ChatAnnotationSession, blob: Blob | null) => {
      const attachmentId = editingSession.attachmentId
      const revision = (uploadRevisionsRef.current.get(attachmentId) ?? 0) + 1
      uploadRevisionsRef.current.set(attachmentId, revision)

      if (!blob) {
        liveStore
          .getState()
          .removeAttachment(workspaceId, editingSession.sourceSessionId, attachmentId)
        return
      }

      void stageAnnotation({
        workspaceId,
        sessionId: editingSession.sourceSessionId,
        localId: attachmentId,
        sourceTab: editingSession.sourceTab,
        blob,
        isCurrent: () => uploadRevisionsRef.current.get(attachmentId) === revision
      })
    },
    [workspaceId]
  )

  const remove = useCallback(
    (localId: string) => {
      const revision = (uploadRevisionsRef.current.get(localId) ?? 0) + 1
      uploadRevisionsRef.current.set(localId, revision)
      if (sessionRef.current?.attachmentId === localId) closeSession(false)
    },
    [closeSession]
  )

  useEffect(() => {
    startRevisionRef.current += 1
    setStarting(false)
    const current = sessionRef.current
    if (!current) return
    const expectedMode = current.origin === 'docked' ? 'split' : 'fullscreen'
    if (
      current.sourceTab !== activeTab ||
      current.sourceSessionId !== sessionId ||
      mode !== expectedMode ||
      !available
    ) {
      closeSession(false)
    }
  }, [activeTab, available, closeSession, mode, sessionId, workspaceId])

  useEffect(() => {
    if (!session) return
    const target = targetRef.current
    if (!target) {
      closeSession(false)
      return
    }

    const observer = new ResizeObserver(entries => {
      const bounds = entries[0]?.contentRect
      if (!bounds) return
      if (
        Math.abs(bounds.width - session.targetWidth) > 1 ||
        Math.abs(bounds.height - session.targetHeight) > 1
      ) {
        closeSession(false)
      }
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [closeSession, session, targetRef])

  useEffect(
    () => () => {
      startRevisionRef.current += 1
    },
    []
  )

  return {
    session,
    starting,
    startDocked: () => void start('docked'),
    startPopup: () => void start('popup'),
    change,
    finish: () => closeSession(true),
    remove
  }
}
