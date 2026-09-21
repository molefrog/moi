import { appendAttachments, attachmentPart } from '@/lib/moi-attachments'
import type { MessageAttachment, Part, Attachment } from '@/lib/types'
import { materializeToPath, resolveUploads, servedUploadUrl } from './uploads'

// Native images carry bytes; every file has a readable path.
type PreparedAttachment =
  | Exclude<Attachment, { type: 'image' }>
  | (Extract<Attachment, { type: 'image' }> & { data: Buffer })

export type PreparedAttachmentMessage = {
  text: string
  attachments: PreparedAttachment[]
  parts: Part[]
}

export class AttachmentUploadError extends Error {
  constructor() {
    super('Attachment not found or expired')
    this.name = 'AttachmentUploadError'
  }
}

function resolveAttachmentUploads(workspaceId: string, inputs: readonly MessageAttachment[]) {
  const ids = inputs.flatMap(input => (input.type === 'upload' ? [input.uploadId] : []))
  const uploads = resolveUploads(workspaceId, ids)
  if (uploads.length !== ids.length) throw new AttachmentUploadError()
  return new Map(uploads.map(upload => [upload.id, upload]))
}

// Path-only harnesses await this before building their message.
export async function materializeAttachmentPaths(
  workspaceId: string,
  inputs: readonly MessageAttachment[] = []
): Promise<void> {
  await Promise.all(
    [...resolveAttachmentUploads(workspaceId, inputs).values()].map(materializeToPath)
  )
}

// Keep construction synchronous so Claude queues a send before an immediate Stop.
// For path delivery, await materializeAttachmentPaths first.
export function prepareAttachmentMessage(
  workspaceId: string,
  text: string,
  inputs: readonly MessageAttachment[] = [],
  inlineImages = true
): PreparedAttachmentMessage {
  const uploads = resolveAttachmentUploads(workspaceId, inputs)
  const attachments: PreparedAttachment[] = []
  const parts: Part[] = []
  for (const input of inputs) {
    if (input.type === 'text') {
      attachments.push(input)
      parts.push(attachmentPart(input))
      continue
    }
    const upload = uploads.get(input.uploadId)
    if (!upload) throw new AttachmentUploadError()
    const metadata = {
      mediaType: upload.mediaType,
      source: input.source
    }
    if (upload.kind === 'image' && inlineImages && upload.data) {
      const attachment: PreparedAttachment = {
        type: 'image',
        ...metadata,
        label: upload.filename,
        purpose: input.purpose,
        data: upload.data
      }
      attachments.push(attachment)
      parts.push(attachmentPart(attachment, servedUploadUrl(upload)))
    } else if (upload.path) {
      const attachment: Attachment = {
        type: 'file',
        ...metadata,
        path: upload.path,
        ...(upload.kind === 'image' ? { purpose: input.purpose } : {})
      }
      attachments.push(attachment)
      parts.push(attachmentPart(attachment))
    }
  }
  const descriptors = attachments.map(attachment => {
    if (!('data' in attachment)) return attachment
    const { data: _data, ...descriptor } = attachment
    return descriptor
  })
  if (text) parts.push({ type: 'text', text })
  return {
    text: appendAttachments(text, descriptors),
    attachments,
    parts
  }
}
