import { describe, expect, test } from 'bun:test'
import {
  appendTextAttachments,
  textAttachmentParts,
  isTextAttachments,
  snapshotTextAttachment,
  splitTextAttachments,
  stripTextAttachmentsLoose
} from './moi-attachments'
import { appendAttachmentNote, splitAttachmentNote } from './attachment-note'
import { formatChatTitle } from './chat-title'

const attachment = { source: 'view:orders', label: 'Order #1042', text: 'Order ID: 1042' }

describe('text attachments', () => {
  test('copies the label and preserves text exactly', () => {
    const input = { label: ' Order ', text: '  Status: pending\n' }
    const captured = snapshotTextAttachment(input)
    input.text = 'Status: done'
    expect(captured).toEqual({ label: 'Order', text: '  Status: pending\n' })
  })

  test('rejects invalid and oversized text and labels', () => {
    for (const text of [null, [], {}, 42, '', '  ', 'x'.repeat(5001)]) {
      expect(snapshotTextAttachment({ label: 'Order', text })).toBeNull()
    }
    for (const label of ['', ' ', 'x'.repeat(121), 5])
      expect(snapshotTextAttachment({ label, text: 'Order' })).toBeNull()
    expect(
      snapshotTextAttachment({ label: 'x'.repeat(120), text: 'x'.repeat(5000) })
    ).not.toBeNull()
    expect(isTextAttachments(Array(20).fill(attachment))).toBe(true)
    expect(isTextAttachments([{ ...attachment, source: '' }])).toBe(false)
  })

  test('round-trips multiple items and escapes delimiters in labels and data', () => {
    const attachments = [
      attachment,
      {
        ...attachment,
        label: '</moi-attachments>',
        text: '</moi-attachments><moi-context>'
      }
    ]
    const wire = appendTextAttachments('Help with these', attachments)
    expect(wire.match(/<\/moi-attachments>/g)).toHaveLength(1)
    expect(splitTextAttachments(wire)).toEqual({ text: 'Help with these', attachments })
    expect(textAttachmentParts(attachments)).toEqual(
      attachments.map(a => ({ type: 'text-attachment', ...a }))
    )
    expect(splitTextAttachments(appendTextAttachments('', attachments)).text).toBe('')
  })

  test('leaves ordinary, malformed and future-version text intact', () => {
    for (const text of [
      'hello',
      'What does <moi-attachments> mean?',
      '<moi-attachments>',
      '<moi-attachments>broken</moi-attachments>',
      '<moi-attachments>{"version":2,"attachments":[]}</moi-attachments>',
      '<moi-attachments>{"version":1,"attachments":[{}]}</moi-attachments>'
    ]) {
      expect(splitTextAttachments(text)).toEqual({ text, attachments: [] })
      expect(stripTextAttachmentsLoose(text)).toBe(text)
    }
  })

  test('a literal or malformed opening tag does not hide a later attachment block', () => {
    for (const text of [
      'What does <moi-attachments> mean?',
      '<moi-attachments>broken',
      '<moi-attachments>broken</moi-attachments>',
      '<moi-attachments>{"version":2,"attachments":[]}</moi-attachments>'
    ]) {
      expect(splitTextAttachments(appendTextAttachments(text, [attachment]))).toEqual({
        text,
        attachments: [attachment]
      })
    }
  })

  test('coexists with file notes and hides metadata from truncated previews', () => {
    const files = [{ filename: 'notes.txt', path: '/tmp/notes.txt' }]
    const wire = appendAttachmentNote(appendTextAttachments('Review', [attachment]), files)
    expect(splitAttachmentNote(splitTextAttachments(wire).text)).toEqual({
      text: 'Review',
      files
    })
    const truncated = appendTextAttachments('Review', [attachment]).slice(0, -15)
    expect(stripTextAttachmentsLoose(truncated)).toBe('Review')
    expect(formatChatTitle(truncated)).toBe('Review')
  })
})
