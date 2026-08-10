import { useCallback, useEffect, useRef, useState } from 'react'

import { toast } from '@/client/components/ui/toast'
import { stageAnnotation } from '@/client/features/chat/attachment-staging'
import { liveStore } from '@/client/features/chat/chat-store'
import type { LayoutMode, WorkspaceTabId } from '@/lib/types'

import { captureElement } from './capture-element'
import type {
  AnnotationOrigin,
  AnnotationOverlayHandle,
  ChatAnnotationController,
  ChatAnnotationSession
} from './types'

type UseChatAnnotationOptions = {
  workspaceId: string
  sessionId: string | null
  activeTab: WorkspaceTabId
  mode: LayoutMode
  available: boolean
  closePopup: () => void
  openPopup: () => void
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
  const [session, setSession] = useState<ChatAnnotationSession | null>(null)
  const [starting, setStarting] = useState(false)
  const targetRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<AnnotationOverlayHandle>(null)
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

  const start = useCallback(async (origin: AnnotationOrigin) => {
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
  }, [])

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

  const finish = useCallback(() => overlayRef.current?.finish(), [])
  const complete = useCallback(() => closeSession(true), [closeSession])
  const startDocked = useCallback(() => void start('docked'), [start])
  const startPopup = useCallback(() => void start('popup'), [start])

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

  const commonControls = {
    active: session !== null,
    starting,
    onRemove: remove
  }

  return {
    docked: available
      ? {
          ...commonControls,
          onToggle: session ? finish : startDocked
        }
      : undefined,
    popup: available
      ? {
          ...commonControls,
          onToggle: session ? finish : startPopup
        }
      : undefined,
    surface: {
      targetRef,
      overlayRef,
      session,
      change,
      complete
    }
  }
}
