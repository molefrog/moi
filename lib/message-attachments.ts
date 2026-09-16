import { isTextAttachments } from './moi-attachments'
import type { TextAttachment } from './types'

import type { MessageAttachment } from './types'

export function isMessageAttachments(value: unknown): value is MessageAttachment[] {
  if (!Array.isArray(value)) return false
  const texts: unknown[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return false
    if (item.type === 'upload') {
      if (typeof item.uploadId !== 'string' || !item.uploadId) return false
    } else if (item.type === 'text') {
      texts.push(item)
    } else return false
  }
  return isTextAttachments(texts)
}

export function partitionMessageAttachments(attachments: readonly MessageAttachment[] = []) {
  const uploadIds: string[] = []
  const textAttachments: TextAttachment[] = []
  for (const attachment of attachments) {
    if (attachment.type === 'upload') uploadIds.push(attachment.uploadId)
    else {
      const { source, label, text } = attachment
      textAttachments.push({ source, label, text })
    }
  }
  return { uploadIds, textAttachments }
}

// Shared by browser validation and both server upload routes.
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024

export function isWorkspaceAttachmentPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !/[\\:\0]/.test(value) &&
    value.split('/').every(segment => segment.length > 0 && !segment.startsWith('.'))
  )
}
