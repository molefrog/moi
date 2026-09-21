import type { AttachmentOrigin, DrawingPurpose, TextAttachment, UploadInfo } from '@/lib/types'

// One composer attachment, tracked per session until the message is sent. A
// file uploads as soon as it's added (drop/paste/pick); an annotation stays a
// local `draft` while it's being drawn and uploads once when the drawing
// session ends. `status` reflects that lifecycle, and `upload` holds the server
// handle once ready. `previewUrl` is a local object URL for image thumbnails
// (revoked on remove/clear).
type StagedUploadFields = {
  label: string
  mediaType: string
  previewUrl?: string
  status: 'draft' | 'uploading' | 'ready'
  upload?: UploadInfo
}

export type StagedAttachment = { localId: string } & (
  | ({ kind: 'file' } & StagedUploadFields & Partial<AttachmentOrigin>)
  | ({ kind: 'drawing'; purpose: DrawingPurpose } & StagedUploadFields & AttachmentOrigin)
  | ({ kind: 'text' } & TextAttachment)
)

export type StagedAttachmentPatch = Partial<
  Pick<StagedUploadFields, 'label' | 'mediaType' | 'previewUrl' | 'status' | 'upload'>
>
