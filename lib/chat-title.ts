import { attachmentLabel, splitAttachments, stripAttachmentsLoose } from './moi-attachments'
const MAX_CHAT_TITLE_LENGTH = 64

export function formatChatTitle(text: string, filenames: readonly string[] = []): string {
  const split = splitAttachments(text)
  const attachmentLabels = split.attachments.map(attachmentLabel)
  const source =
    stripAttachmentsLoose(split.text).trim() ||
    (attachmentLabels.length ? attachmentLabels : filenames).filter(Boolean).join(', ')
  return source.replace(/\s+/gu, ' ').trim().slice(0, MAX_CHAT_TITLE_LENGTH).trimEnd()
}
