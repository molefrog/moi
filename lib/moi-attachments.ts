// Durable, user-selected context. Unlike ambient moi context, this belongs to
// one message and is retained in the provider's transcript.
import type { Part } from './format'
import { isParamsRecord } from './workspace-tabs'

import type { TextAttachmentInput, TextAttachment } from './types'
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
        typeof item.source === 'string' &&
        /^(widget|view):[^/]+$/.test(item.source) &&
        snapshotTextAttachment(item) !== null
    )
  )
}

export function textAttachmentParts(attachments: readonly TextAttachment[] = []): Part[] {
  return attachments.map(({ source, label, text }) => ({
    type: 'text-attachment',
    source,
    label,
    text
  }))
}

export function appendTextAttachments(
  text: string,
  attachments: readonly TextAttachment[] = []
): string {
  if (!attachments.length) return text
  if (!isTextAttachments(attachments)) throw new Error('Invalid text attachments')
  const json = JSON.stringify({ version: 1, attachments }).replaceAll('<', '\\u003c')
  return `${text}\n\n${OPEN}\n${json}\n${CLOSE}`.trim()
}

// Only a complete, valid v1 block is hidden. Ordinary text and malformed or
// future-version blocks are left intact instead of silently eating user text.
export function splitTextAttachments(text: string): {
  text: string
  attachments: TextAttachment[]
} {
  const attachments: TextAttachment[] = []
  // Serialized JSON escapes '<', so a candidate cannot span another opening
  // tag. A literal tag in the user's text must not swallow the saved block.
  const cleaned = text.replace(
    /<moi-attachments>([^<]*)<\/moi-attachments>/g,
    (block: string, json: string) => {
      try {
        const parsed: unknown = JSON.parse(json)
        if (
          !isParamsRecord(parsed) ||
          parsed.version !== 1 ||
          !isTextAttachments(parsed.attachments)
        )
          return block
        attachments.push(...parsed.attachments)
        return ''
      } catch {
        return block
      }
    }
  )
  return { text: attachments.length ? cleaned.trim() : text, attachments }
}

export function stripTextAttachments(text: string): string {
  return splitTextAttachments(text).text
}

// Truncated session previews may end halfway through the metadata block.
export function stripTextAttachmentsLoose(text: string): string {
  const clean = stripTextAttachments(text)
  const start = clean.search(/<moi-attachments>\s*\{"version":1,"attachments":\[/)
  // Only hide an unfinished block with our serialized prefix. Literal tags and
  // complete malformed blocks still belong to the user's visible text.
  return (start < 0 || clean.includes(CLOSE, start) ? clean : clean.slice(0, start)).trimEnd()
}
