import type { TextAttachment, UploadInfo, WorkspaceTabId } from '@/lib/types'

// One composer attachment, tracked per session until the message is sent. A
// file uploads as soon as it's added (drop/paste/pick); an annotation stays a
// local `draft` while it's being drawn and uploads once when the drawing
// session ends. `status` reflects that lifecycle, and `upload` holds the server
// handle once ready. `previewUrl` is a local object URL for image thumbnails
// (revoked on remove/clear).
type UploadAttachmentBase = {
  localId: string
  name: string
  mediaType: string
  previewUrl?: string
  status: 'draft' | 'uploading' | 'ready' | 'error'
  upload?: UploadInfo
  error?: string
}

export type DrawingPurpose = 'annotation' | 'sketch'

export type UploadedChatAttachment = UploadAttachmentBase &
  (
    | { kind: 'file'; purpose?: never; sourceTab?: never }
    | { kind: 'drawing'; purpose: DrawingPurpose; sourceTab: WorkspaceTabId }
  )

export type ChatAttachment =
  | UploadedChatAttachment
  | { kind: 'text'; localId: string; name: string; attachment: TextAttachment }

export type ChatAttachmentPatch = Partial<
  Pick<UploadAttachmentBase, 'name' | 'mediaType' | 'previewUrl' | 'status' | 'upload' | 'error'>
>
