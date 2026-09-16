import { isContextAttachments } from './moi-attachments'
import type { ContextAttachment } from './types'

import type { MessageAttachment } from './types'

export function isMessageAttachments(value: unknown): value is MessageAttachment[] {
  if (!Array.isArray(value)) return false
  const contexts: unknown[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return false
    if (item.type === 'upload') {
      if (typeof item.uploadId !== 'string' || !item.uploadId) return false
    } else if (item.type === 'context') {
      contexts.push(item)
    } else return false
  }
  return isContextAttachments(contexts)
}

export function partitionMessageAttachments(attachments: readonly MessageAttachment[] = []) {
  const uploadIds: string[] = []
  const contextAttachments: ContextAttachment[] = []
  for (const attachment of attachments) {
    if (attachment.type === 'upload') uploadIds.push(attachment.uploadId)
    else {
      const { source, label, context } = attachment
      contextAttachments.push({ source, label, context })
    }
  }
  return { uploadIds, contextAttachments }
}
