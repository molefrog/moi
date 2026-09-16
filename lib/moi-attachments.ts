// Durable, user-selected context. Unlike ambient moi context, this belongs to
// one message and is retained in the provider's transcript.
import type { Part } from './format'
import { isParamsRecord } from './workspace-tabs'

import type { ChatContextInput, ContextAttachment } from './types'
export const MAX_CONTEXT_ATTACHMENT_CHARS = 5000
export const MAX_CONTEXT_LABEL_CHARS = 120
const OPEN = '<moi-attachments>'
const CLOSE = '</moi-attachments>'

// Reject values JSON would silently change (functions, undefined, Dates,
// non-finite numbers, etc.). Repeated references are fine; cycles are not.
function isJson(value: unknown, parents = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || parents.has(value)) return false
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false
  parents.add(value)
  const valid =
    Object.getOwnPropertySymbols(value).length === 0 &&
    (Array.isArray(value) ? Array.from(value) : Object.values(value)).every(v => isJson(v, parents))
  parents.delete(value)
  return valid
}

export function snapshotChatContext(value: unknown): ChatContextInput | null {
  try {
    if (!isParamsRecord(value) || typeof value.label !== 'string') return null
    const label = value.label.trim()
    if (
      !label ||
      label.length > MAX_CONTEXT_LABEL_CHARS ||
      !isParamsRecord(value.context) ||
      !isJson(value.context)
    )
      return null
    const json = JSON.stringify(value.context)
    if (json.length > MAX_CONTEXT_ATTACHMENT_CHARS) return null
    return { label, context: JSON.parse(json) as Record<string, unknown> }
  } catch {
    return null
  }
}

export function isContextAttachments(value: unknown): value is ContextAttachment[] {
  return (
    Array.isArray(value) &&
    value.every(
      item =>
        isParamsRecord(item) &&
        typeof item.source === 'string' &&
        /^(widget|view):[^/]+$/.test(item.source) &&
        snapshotChatContext(item) !== null
    )
  )
}

export function contextAttachmentParts(attachments: readonly ContextAttachment[] = []): Part[] {
  return attachments.map(({ source, label, context }) => ({
    type: 'context',
    source,
    label,
    context
  }))
}

export function appendContextAttachments(
  text: string,
  attachments: readonly ContextAttachment[] = []
): string {
  if (!attachments.length) return text
  if (!isContextAttachments(attachments)) throw new Error('Invalid context attachments')
  const json = JSON.stringify({ version: 1, attachments }).replaceAll('<', '\\u003c')
  return `${text}\n\n${OPEN}\n${json}\n${CLOSE}`.trim()
}

// Only a complete, valid v1 block is hidden. Ordinary text and malformed or
// future-version blocks are left intact instead of silently eating user text.
export function splitContextAttachments(text: string): {
  text: string
  attachments: ContextAttachment[]
} {
  const attachments: ContextAttachment[] = []
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
          !isContextAttachments(parsed.attachments)
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

export function stripContextAttachments(text: string): string {
  return splitContextAttachments(text).text
}

// Truncated session previews may end halfway through the metadata block.
export function stripContextAttachmentsLoose(text: string): string {
  const clean = stripContextAttachments(text)
  const start = clean.indexOf(OPEN)
  return (start < 0 ? clean : clean.slice(0, start)).trimEnd()
}
