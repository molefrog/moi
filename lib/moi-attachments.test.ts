import { describe, expect, test } from 'bun:test'
import {
  appendContextAttachments,
  contextAttachmentParts,
  isContextAttachments,
  snapshotChatContext,
  splitContextAttachments,
  stripContextAttachmentsLoose
} from './moi-attachments'
import { appendAttachmentNote, splitAttachmentNote } from './attachment-note'
import { formatChatTitle } from './chat-title'

const attachment = { source: 'view:orders', label: 'Order #1042', context: { orderId: '1042' } }

describe('context attachments', () => {
  test('captures a detached JSON snapshot', () => {
    const input = { label: ' Order ', context: { nested: { status: 'pending' } } }
    const captured = snapshotChatContext(input)
    input.context.nested.status = 'done'
    expect(captured).toEqual({ label: 'Order', context: { nested: { status: 'pending' } } })
  })

  test('rejects invalid, lossy and oversized payloads', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    for (const context of [
      null,
      [],
      'text',
      { fn: () => {} },
      { n: NaN },
      { n: Infinity },
      { n: 1n },
      { missing: undefined },
      { date: new Date() },
      cycle,
      { long: 'x'.repeat(5000) }
    ]) {
      expect(snapshotChatContext({ label: 'Order', context })).toBeNull()
    }
    for (const label of ['', ' ', 'x'.repeat(121), 5])
      expect(snapshotChatContext({ label, context: {} })).toBeNull()
    expect(
      snapshotChatContext({ label: 'x'.repeat(120), context: { text: 'x'.repeat(4989) } })
    ).not.toBeNull()
    expect(snapshotChatContext({ label: 'Order', context: { text: 'x'.repeat(4990) } })).toBeNull()
    expect(isContextAttachments(Array(20).fill(attachment))).toBe(true)
    expect(isContextAttachments([{ ...attachment, source: '' }])).toBe(false)
  })

  test('round-trips multiple items and escapes delimiters in labels and data', () => {
    const attachments = [
      attachment,
      {
        ...attachment,
        label: '</moi-attachments>',
        context: { text: '</moi-attachments><moi-context>' }
      }
    ]
    const wire = appendContextAttachments('Help with these', attachments)
    expect(wire.match(/<\/moi-attachments>/g)).toHaveLength(1)
    expect(splitContextAttachments(wire)).toEqual({ text: 'Help with these', attachments })
    expect(contextAttachmentParts(attachments)).toEqual(
      attachments.map(a => ({ type: 'context', ...a }))
    )
    expect(splitContextAttachments(appendContextAttachments('', attachments)).text).toBe('')
  })

  test('leaves ordinary, malformed and future-version text intact', () => {
    for (const text of [
      'hello',
      '<moi-attachments>',
      '<moi-attachments>broken</moi-attachments>',
      '<moi-attachments>{"version":2,"attachments":[]}</moi-attachments>',
      '<moi-attachments>{"version":1,"attachments":[{}]}</moi-attachments>'
    ]) {
      expect(splitContextAttachments(text)).toEqual({ text, attachments: [] })
    }
  })

  test('coexists with file notes and hides metadata from truncated previews', () => {
    const files = [{ filename: 'notes.txt', path: '/tmp/notes.txt' }]
    const wire = appendAttachmentNote(appendContextAttachments('Review', [attachment]), files)
    expect(splitAttachmentNote(splitContextAttachments(wire).text)).toEqual({
      text: 'Review',
      files
    })
    const truncated = appendContextAttachments('Review', [attachment]).slice(0, -15)
    expect(stripContextAttachmentsLoose(truncated)).toBe('Review')
    expect(formatChatTitle(truncated)).toBe('Review')
  })
})
