import type { WorkspaceTabId } from '@/lib/types'

import { attachmentKey, type ChatAttachment, liveStore } from './chat-store'
import { uploadFiles } from './uploads'

type ComposerTarget = {
  workspaceId: string
  sessionId: string | null
}

export function stageComposerFiles(
  { workspaceId, sessionId }: ComposerTarget,
  files: File[]
): void {
  if (files.length === 0) return

  const items: ChatAttachment[] = files.map(file => ({
    kind: 'file',
    localId: crypto.randomUUID(),
    name: file.name || 'file',
    mediaType: file.type || 'application/octet-stream',
    previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    status: 'uploading'
  }))
  liveStore.getState().addAttachments(workspaceId, sessionId, items)

  items.forEach((item, index) => {
    uploadFiles(workspaceId, [files[index]])
      .then(([upload]) => {
        liveStore.getState().updateAttachment(workspaceId, sessionId, item.localId, {
          status: 'ready',
          upload,
          mediaType: upload.mediaType
        })
      })
      .catch((error: unknown) => {
        liveStore.getState().updateAttachment(workspaceId, sessionId, item.localId, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed'
        })
      })
  })
}

type StageAnnotationDraftInput = ComposerTarget & {
  localId: string
  sourceTab: WorkspaceTabId
  blob: Blob
}

// Local-only staging while the user is still drawing: the chip shows the
// latest composite as its preview, but nothing is uploaded until the drawing
// session ends (stageAnnotation).
export function stageAnnotationDraft({
  workspaceId,
  sessionId,
  localId,
  sourceTab,
  blob
}: StageAnnotationDraftInput): void {
  const previewUrl = URL.createObjectURL(blob)
  const store = liveStore.getState()
  const existing = store.attachments[attachmentKey(workspaceId, sessionId)]?.some(
    attachment => attachment.localId === localId
  )

  if (existing) {
    store.updateAttachment(workspaceId, sessionId, localId, {
      previewUrl,
      status: 'draft',
      upload: undefined,
      error: undefined
    })
  } else {
    store.addAttachments(workspaceId, sessionId, [
      {
        kind: 'annotation',
        localId,
        sourceTab,
        name: 'Annotation.png',
        mediaType: 'image/png',
        previewUrl,
        status: 'draft'
      }
    ])
  }
}

type StageAnnotationInput = StageAnnotationDraftInput & {
  isCurrent: () => boolean
}

// Upload an annotation once its drawing session ends (finish, send, or an
// implicit cancel that keeps the attachment). `isCurrent` guards the result:
// a stale upload must not resurrect an attachment the user has removed.
export async function stageAnnotation({
  workspaceId,
  sessionId,
  localId,
  sourceTab,
  blob,
  isCurrent
}: StageAnnotationInput): Promise<void> {
  const previewUrl = URL.createObjectURL(blob)
  const store = liveStore.getState()
  const existing = store.attachments[attachmentKey(workspaceId, sessionId)]?.some(
    attachment => attachment.localId === localId
  )

  if (existing) {
    store.updateAttachment(workspaceId, sessionId, localId, {
      previewUrl,
      status: 'uploading',
      upload: undefined,
      error: undefined
    })
  } else {
    store.addAttachments(workspaceId, sessionId, [
      {
        kind: 'annotation',
        localId,
        sourceTab,
        name: 'Annotation.png',
        mediaType: 'image/png',
        previewUrl,
        status: 'uploading'
      }
    ])
  }

  try {
    const [upload] = await uploadFiles(workspaceId, [
      new File([blob], 'Annotation.png', { type: 'image/png' })
    ])
    if (!isCurrent()) return
    liveStore.getState().updateAttachment(workspaceId, sessionId, localId, {
      status: 'ready',
      upload,
      mediaType: upload.mediaType,
      error: undefined
    })
  } catch {
    if (!isCurrent()) return
    liveStore.getState().removeAttachment(workspaceId, sessionId, localId)
  }
}
