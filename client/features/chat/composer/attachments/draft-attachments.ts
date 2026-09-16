import type { TextAttachment } from '@/lib/types'
import type { WorkspaceTabId } from '@/lib/types'

import { attachmentKey, liveStore } from '../../chat-store'
import type { DrawingPurpose } from './types'
import { uploadFiles, uploadChatFile } from './uploads'
import type { AppletChatAttachment } from '@/client/features/applets/applet-runtime'
import { reportAppletError } from '@/client/features/applets/applet-log'
import { toast } from '@/client/components/ui/toast'

type ComposerTarget = {
  workspaceId: string
  sessionId: string | null
}

export function stageComposerFiles(target: ComposerTarget, files: File[]): void {
  for (const file of files) void stageFile(target, file)
}

// Both file sources enter the same draft lifecycle and become ordinary uploads.
async function stageFile(
  { workspaceId, sessionId }: ComposerTarget,
  input: File | string,
  onError?: (message: string) => void
): Promise<void> {
  const file = typeof input === 'string' ? null : input
  const name = typeof input === 'string' ? input.split('/').at(-1)! : input.name || 'file'
  const localId = crypto.randomUUID()
  liveStore.getState().addAttachments(workspaceId, sessionId, [
    {
      kind: 'file',
      localId,
      name,
      mediaType: file?.type || 'application/octet-stream',
      previewUrl: file?.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      status: 'uploading'
    }
  ])
  try {
    const upload = await uploadChatFile(workspaceId, input)
    liveStore.getState().updateAttachment(workspaceId, localId, {
      status: 'ready',
      upload,
      name: upload.filename,
      mediaType: upload.mediaType,
      ...(upload.kind === 'image' && !file?.type.startsWith('image/')
        ? { previewUrl: `/api/workspaces/${workspaceId}/uploads/${upload.id}` }
        : {})
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed'
    liveStore.getState().removeAttachment(workspaceId, localId)
    toast.add({ title: `Couldn’t add ${name}`, description: message, type: 'error' })
    onError?.(message)
  }
}

export function stageChatAttachment(
  target: ComposerTarget,
  input: AppletChatAttachment
): Promise<void> {
  if (input.type === 'text') {
    const { source, label, text } = input
    stageTextAttachment(target, { source, label, text })
    return Promise.resolve()
  }
  return stageFile(target, input.file ?? input.path, message => {
    reportAppletError(target.workspaceId, {
      source: 'runtime',
      message: `addChatAttachment() from ${input.source}: ${message}`
    })
  })
}

type StageDrawingDraftInput = ComposerTarget & {
  localId: string
  purpose: DrawingPurpose
  sourceTab: WorkspaceTabId
  blob: Blob
}

// Local-only staging while the user is still drawing: the chip shows the
// latest composite as its preview, but nothing is uploaded until the drawing
// session ends (stageDrawing).
export function stageDrawingDraft({
  workspaceId,
  sessionId,
  localId,
  purpose,
  sourceTab,
  blob
}: StageDrawingDraftInput): void {
  const label = purpose === 'sketch' ? 'Sketch' : 'Annotation'
  const previewUrl = URL.createObjectURL(blob)
  const store = liveStore.getState()
  const existing = Object.entries(store.attachments).some(
    ([key, attachments]) =>
      key.startsWith(`${workspaceId}:`) &&
      attachments.some(attachment => attachment.localId === localId)
  )

  if (existing) {
    store.updateAttachment(workspaceId, localId, {
      previewUrl,
      status: 'draft',
      upload: undefined
    })
  } else {
    store.addAttachments(workspaceId, sessionId, [
      {
        kind: 'drawing',
        purpose,
        localId,
        sourceTab,
        name: `${label}.png`,
        mediaType: 'image/png',
        previewUrl,
        status: 'draft'
      }
    ])
  }
}

type StageDrawingInput = StageDrawingDraftInput & {
  isCurrent: () => boolean
}

// Upload a drawing once its editing session ends (finish, send, or an
// implicit cancel that keeps the attachment). `isCurrent` guards the result:
// a stale upload must not resurrect an attachment the user has removed.
export async function stageDrawing({
  workspaceId,
  sessionId,
  localId,
  purpose,
  sourceTab,
  blob,
  isCurrent
}: StageDrawingInput): Promise<void> {
  const label = purpose === 'sketch' ? 'Sketch' : 'Annotation'
  const previewUrl = URL.createObjectURL(blob)
  const store = liveStore.getState()
  const existing = Object.entries(store.attachments).some(
    ([key, attachments]) =>
      key.startsWith(`${workspaceId}:`) &&
      attachments.some(attachment => attachment.localId === localId)
  )

  if (existing) {
    store.updateAttachment(workspaceId, localId, {
      previewUrl,
      status: 'uploading',
      upload: undefined
    })
  } else {
    store.addAttachments(workspaceId, sessionId, [
      {
        kind: 'drawing',
        purpose,
        localId,
        sourceTab,
        name: `${label}.png`,
        mediaType: 'image/png',
        previewUrl,
        status: 'uploading'
      }
    ])
  }

  try {
    const [upload] = await uploadFiles(workspaceId, [
      new File([blob], `${label}.png`, { type: 'image/png' })
    ])
    if (!isCurrent()) return
    liveStore.getState().updateAttachment(workspaceId, localId, {
      status: 'ready',
      upload,
      mediaType: upload.mediaType
    })
  } catch {
    if (!isCurrent()) return
    liveStore.getState().removeAttachment(workspaceId, localId)
  }
}

// Duplicate text is ignored; the caller still reveals chat.
export function stageTextAttachment(
  { workspaceId, sessionId }: ComposerTarget,
  attachment: TextAttachment
): void {
  const store = liveStore.getState()
  const pending = (store.attachments[attachmentKey(workspaceId, sessionId)] ?? []).filter(
    item => item.kind === 'text'
  )
  if (
    pending.some(
      item =>
        item.attachment.source === attachment.source &&
        item.attachment.label === attachment.label &&
        item.attachment.text === attachment.text
    )
  )
    return
  store.addAttachments(workspaceId, sessionId, [
    { kind: 'text', localId: crypto.randomUUID(), name: attachment.label, attachment }
  ])
}
