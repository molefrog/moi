import type {
  AttachmentInput,
  AttachmentOrigin,
  DrawingPurpose,
  TextAttachment,
  WorkspaceTabId
} from '@/lib/types'

import { findAttachment, liveStore } from '../../chat-store'
import { uploadChatFile } from './uploads'
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
  onError?: (message: string) => void,
  source?: string
): Promise<void> {
  const file = typeof input === 'string' ? null : input
  const label = typeof input === 'string' ? input.split('/').at(-1)! : input.name || 'file'
  const localId = crypto.randomUUID()
  liveStore.getState().addAttachments(workspaceId, sessionId, [
    {
      kind: 'file',
      source,
      localId,
      label,
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
      label: upload.filename,
      mediaType: upload.mediaType,
      ...(upload.kind === 'image' && !file?.type.startsWith('image/')
        ? { previewUrl: `/api/workspaces/${workspaceId}/uploads/${upload.id}` }
        : {})
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'The file couldn’t be uploaded'
    liveStore.getState().removeAttachment(workspaceId, localId)
    toast.add({ title: `Couldn’t add ${label}`, description: message, type: 'error' })
    onError?.(message)
  }
}

export function stageChatAttachment(
  target: ComposerTarget,
  input: AttachmentInput & AttachmentOrigin
): Promise<void> {
  if (input.type === 'text') {
    const { source, label, text } = input
    stageTextAttachment(target, { source, label, text })
    return Promise.resolve()
  }
  return stageFile(
    target,
    input.file ?? input.path,
    message => {
      reportAppletError(target.workspaceId, {
        source: 'runtime',
        message: `addChatAttachment() from ${input.source}: ${message}`
      })
    },
    input.source
  )
}

type StageDrawingDraftInput = ComposerTarget & {
  localId: string
  purpose: DrawingPurpose
  source: WorkspaceTabId
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
  source,
  blob
}: StageDrawingDraftInput): void {
  const label = purpose === 'sketch' ? 'Sketch' : 'Annotation'
  const previewUrl = URL.createObjectURL(blob)
  const store = liveStore.getState()
  const existing = findAttachment(store.attachments, workspaceId, localId)

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
        source,
        label: `${label}.png`,
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
export async function stageDrawing(input: StageDrawingInput): Promise<void> {
  const { workspaceId, localId, purpose, blob, isCurrent } = input
  const label = purpose === 'sketch' ? 'Sketch' : 'Annotation'
  stageDrawingDraft(input)
  liveStore.getState().updateAttachment(workspaceId, localId, { status: 'uploading' })

  try {
    const upload = await uploadChatFile(
      workspaceId,
      new File([blob], `${label}.png`, { type: 'image/png' })
    )
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

export function stageTextAttachment(
  { workspaceId, sessionId }: ComposerTarget,
  attachment: TextAttachment
): void {
  const store = liveStore.getState()
  store.addAttachments(workspaceId, sessionId, [
    { kind: 'text', localId: crypto.randomUUID(), ...attachment }
  ])
}
