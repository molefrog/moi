// Durable, user-selected context. Unlike ambient moi context, this belongs to
// one message and is retained in the provider's transcript.
import type { Part } from './format'
import { isParamsRecord } from './workspace-tabs'
import { isAttachmentOnlyPlaceholder, splitAttachmentNote } from './attachment-note'
import { stripMoiContext } from './moi-context'

import type { DrawingPurpose, Attachment, TextAttachmentInput, TextAttachment } from './types'
export const MAX_TEXT_ATTACHMENT_CHARS = 5000
export const MAX_ATTACHMENT_LABEL_CHARS = 120
const OPEN = '<moi-attachments>'
const CLOSE = '</moi-attachments>'

// Copy the display label and immutable text when the user selects it.
export function snapshotTextAttachment(value: unknown): TextAttachmentInput | null {
  if (!isParamsRecord(value) || typeof value.label !== 'string') return null
  const label = value.label.trim()
  if (
    !label ||
    label.length > MAX_ATTACHMENT_LABEL_CHARS ||
    typeof value.text !== 'string' ||
    !value.text.trim() ||
    value.text.length > MAX_TEXT_ATTACHMENT_CHARS
  )
    return null
  return { label, text: value.text }
}

export function isTextAttachments(value: unknown): value is TextAttachment[] {
  return (
    Array.isArray(value) &&
    value.every(
      item =>
        isParamsRecord(item) &&
        item.purpose === undefined &&
        (item.source === undefined ||
          (typeof item.source === 'string' && item.source.length > 0)) &&
        snapshotTextAttachment(item) !== null
    )
  )
}

export function isDrawingPurpose(value: unknown): value is DrawingPurpose {
  return value === 'annotation' || value === 'sketch'
}

function isResolvedAttachments(value: unknown): value is Attachment[] {
  return (
    Array.isArray(value) &&
    value.every(item => {
      if (!isParamsRecord(item)) return false
      if (item.type === 'text') return isTextAttachments([item])
      if (item.type !== 'file' && item.type !== 'image') return false
      if (item.source !== undefined && (typeof item.source !== 'string' || !item.source))
        return false
      if (typeof item.mediaType !== 'string' || !item.mediaType) return false
      if (
        item.purpose !== undefined &&
        (!isDrawingPurpose(item.purpose) || !item.mediaType.startsWith('image/'))
      )
        return false
      const hasPath =
        typeof item.path === 'string' &&
        /^(\/|[A-Za-z]:[\\/])/.test(item.path) &&
        !item.path.includes('\0')
      if (item.type === 'file') return hasPath && item.label === undefined
      return (
        item.path === undefined &&
        item.mediaType.startsWith('image/') &&
        typeof item.label === 'string' &&
        Boolean(item.label.trim())
      )
    })
  )
}

export function appendAttachments(text: string, attachments: readonly Attachment[]): string {
  if (!attachments.length) return text
  if (!isResolvedAttachments(attachments)) throw new Error('Invalid attachments')
  const json = JSON.stringify(attachments).replaceAll('<', '\\u003c')
  return `${text}\n\n${OPEN}\n${json}\n${CLOSE}`.trim()
}

// Hide only recognized, complete blocks. Old development envelopes still read.
export function splitAttachments(text: string): {
  text: string
  attachments: Attachment[]
} {
  const attachments: Attachment[] = []
  let found = false
  // Serialized JSON escapes '<', so a candidate cannot span another opening
  // tag. A literal tag in the user's text must not swallow the saved block.
  const cleaned = text.replace(
    /<moi-attachments>([^<]*)<\/moi-attachments>/g,
    (block: string, json: string) => {
      try {
        const parsed: unknown = JSON.parse(json)
        const entries =
          isParamsRecord(parsed) && parsed.version === 1 && Array.isArray(parsed.attachments)
            ? parsed.attachments.map(item =>
                isParamsRecord(item)
                  ? { type: 'text', source: item.source, label: item.label, text: item.text }
                  : item
              )
            : parsed
        if (!isResolvedAttachments(entries)) return block
        attachments.push(...entries)
        found = true
        return ''
      } catch {
        return block
      }
    }
  )
  return { text: found ? cleaned.trim() : text, attachments }
}

export function attachmentLabel(attachment: Attachment): string {
  return attachment.type === 'file' ? attachment.path.split(/[\\/]/).at(-1)! : attachment.label
}

export function attachmentPart(attachment: Attachment, previewUrl?: string): Part {
  const { source } = attachment
  const label = attachmentLabel(attachment)
  if (attachment.type === 'text') {
    return {
      type: 'text-attachment',
      source: attachment.source,
      label,
      text: attachment.text
    }
  }
  return {
    type: 'file-attachment',
    label,
    mediaType: attachment.mediaType,
    source,
    ...(attachment.purpose ? { purpose: attachment.purpose } : {}),
    // Filesystem-only images keep their identity and render as labelled chips.
    previewUrl,
    path: attachment.type === 'file' ? attachment.path : undefined
  }
}

// Pair image descriptors with native image parts by order. Unclaimed native
// parts belong to older or external messages and keep their existing display.
export function attachmentParts(
  attachments: readonly Attachment[],
  nativeImages: readonly Part[] = []
): Part[] {
  let imageIndex = 0
  const parts: Part[] = attachments.map(attachment => {
    const image = attachment.type === 'image' ? nativeImages[imageIndex++] : undefined
    if (image?.type !== 'file-attachment') return attachmentPart(attachment)
    const part = attachmentPart(attachment, image.previewUrl)
    if (part.type === 'file-attachment') part.path ??= image.path
    return part
  })
  return [...parts, ...nativeImages.slice(imageIndex)]
}

// Provider adapters first map native blocks to Parts, then share this replay
// step. File notes are read-only compatibility for published transcripts.
export function replayAttachmentParts(parts: readonly Part[]): Part[] {
  const raw = parts
    .filter(p => p.type === 'text')
    .map(p => p.text)
    .join('\n')
  const parsed = splitAttachments(stripMoiContext(raw))
  const legacy = splitAttachmentNote(parsed.text)
  const nativeImages = parts.filter(
    p => p.type === 'file-attachment' && p.mediaType.startsWith('image/')
  )
  const rest = parts.filter(p => p.type !== 'text' && !nativeImages.includes(p))
  const displayed: Part[] = [
    ...attachmentParts(parsed.attachments, nativeImages),
    ...legacy.files.map(file => ({
      type: 'file-attachment' as const,
      label: file.filename,
      mediaType: 'application/octet-stream',
      path: file.path
    })),
    ...rest
  ]
  const text =
    isAttachmentOnlyPlaceholder(legacy.text) && displayed.some(p => p.type === 'file-attachment')
      ? ''
      : legacy.text
  if (text) displayed.push({ type: 'text', text })
  return displayed
}

export function stripAttachments(text: string): string {
  return splitAttachments(text).text
}

// Truncated session previews may end halfway through the metadata block.
export function stripAttachmentsLoose(text: string): string {
  const clean = stripAttachments(text)
  const start = clean.search(/<moi-attachments>\s*(?:\[|\{"version":1,"attachments":\[)/)
  // Only hide an unfinished block with our serialized prefix. Literal tags and
  // complete malformed blocks still belong to the user's visible text.
  return (start < 0 || clean.includes(CLOSE, start) ? clean : clean.slice(0, start)).trimEnd()
}
