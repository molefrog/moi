import { describe, expect, test } from 'bun:test'
import {
  appendAttachments,
  attachmentLabel,
  attachmentPart,
  attachmentParts,
  isTextAttachments,
  snapshotTextAttachment,
  splitAttachments,
  replayAttachmentParts,
  stripAttachmentsLoose
} from './moi-attachments'
import { appendAttachmentNote, splitAttachmentNote } from './attachment-note'
import { formatChatTitle } from './chat-title'

const attachment = {
  type: 'text' as const,
  source: 'view:orders',
  label: 'Order #1042',
  text: 'Order ID: 1042'
}

describe('text attachments', () => {
  test('round-trips text with optional origin and rejects invalid origins', () => {
    const text = { type: 'text' as const, label: 'Note', text: 'User-selected context' }
    for (const item of [text, { ...text, source: 'overview' }, attachment]) {
      expect(isTextAttachments([item])).toBe(true)
      expect(splitAttachments(appendAttachments('', [item])).attachments).toEqual([item])
      expect(attachmentParts([item])).toEqual([{ ...item, type: 'text-attachment' }])
    }
    for (const source of ['', null, 42, {}, []]) {
      const item = { ...text, source }
      expect(isTextAttachments([item])).toBe(false)
      const raw = `<moi-attachments>${JSON.stringify([item])}</moi-attachments>`
      expect(splitAttachments(raw)).toEqual({ text: raw, attachments: [] })
    }
  })

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
    const wire = appendAttachments('Help with these', attachments)
    expect(wire.match(/<\/moi-attachments>/g)).toHaveLength(1)
    expect(splitAttachments(wire)).toEqual({ text: 'Help with these', attachments })
    expect(attachmentParts(attachments)).toEqual(
      attachments.map(a => ({ ...a, type: 'text-attachment' }))
    )
    expect(splitAttachments(appendAttachments('', attachments)).text).toBe('')
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
      expect(splitAttachments(text)).toEqual({ text, attachments: [] })
      expect(stripAttachmentsLoose(text)).toBe(text)
    }
  })

  test('drawing purpose is only valid for image media', () => {
    const file = {
      type: 'file',
      mediaType: 'text/plain',
      path: '/tmp/report.txt',
      source: 'view:orders'
    }
    for (const entry of [attachment, file]) {
      const text = `<moi-attachments>${JSON.stringify([{ ...entry, purpose: 'sketch' }])}</moi-attachments>`
      expect(splitAttachments(text)).toEqual({ text, attachments: [] })
    }
    const image = {
      type: 'image' as const,
      label: 'Sketch',
      mediaType: 'image/png',
      source: 'view:orders',
      purpose: 'sketch' as const
    }
    expect(splitAttachments(appendAttachments('', [image])).attachments).toEqual([image])
    const imageFile = {
      type: 'file' as const,
      mediaType: 'image/png',
      path: '/tmp/sketch.png',
      purpose: 'sketch' as const
    }
    expect(splitAttachments(appendAttachments('', [imageFile])).attachments).toEqual([imageFile])
  })

  test('resolved files use paths and native images use labels', () => {
    const pathImage = { type: 'file' as const, mediaType: 'image/png', path: '/tmp/sketch.png' }
    const nativeImage = { type: 'image' as const, mediaType: 'image/png', label: 'Sketch.png' }
    for (const image of [pathImage, nativeImage]) {
      expect(splitAttachments(appendAttachments('', [image])).attachments).toEqual([image])
    }
    for (const image of [
      { ...pathImage, label: 'Sketch.png' },
      { type: 'image', mediaType: 'image/png' },
      { type: 'image', mediaType: 'image/png', label: 'Sketch.png', path: '/tmp/sketch.png' }
    ]) {
      const text = `<moi-attachments>${JSON.stringify([image])}</moi-attachments>`
      expect(splitAttachments(text)).toEqual({ text, attachments: [] })
    }
  })

  test('a literal or malformed opening tag does not hide a later attachment block', () => {
    for (const text of [
      'What does <moi-attachments> mean?',
      '<moi-attachments>broken',
      '<moi-attachments>broken</moi-attachments>',
      '<moi-attachments>{"version":2,"attachments":[]}</moi-attachments>'
    ]) {
      expect(splitAttachments(appendAttachments(text, [attachment]))).toEqual({
        text,
        attachments: [attachment]
      })
    }
  })

  test('coexists with file notes and hides metadata from truncated previews', () => {
    const files = [{ filename: 'notes.txt', path: '/tmp/notes.txt' }]
    const wire = appendAttachmentNote(appendAttachments('Review', [attachment]), files)
    expect(splitAttachmentNote(splitAttachments(wire).text)).toEqual({
      text: 'Review',
      files
    })
    const truncated = appendAttachments('Review', [attachment]).slice(0, -15)
    expect(stripAttachmentsLoose(truncated)).toBe('Review')
    expect(formatChatTitle(truncated)).toBe('Review')
  })
})

test('file names survive serialization on Unix and Windows paths', () => {
  for (const path of ['/tmp/report.pdf', String.raw`C:\uploads\report.pdf`]) {
    const file = { type: 'file' as const, mediaType: 'application/pdf', path }
    const wire = appendAttachments('', [file])
    expect(wire).not.toContain('"label"')
    expect(splitAttachments(wire).attachments).toEqual([file])
    expect(attachmentLabel(file)).toBe('report.pdf')
    expect(replayAttachmentParts([{ type: 'text', text: wire }])).toEqual([
      { type: 'file-attachment', label: 'report.pdf', mediaType: 'application/pdf', path }
    ])
  }
})

test('legacy file notes retain their explicit display name', () => {
  const wire = appendAttachmentNote('', [{ filename: 'report.pdf', path: '/tmp/storage-id' }])
  expect(replayAttachmentParts([{ type: 'text', text: wire }])).toEqual([
    {
      type: 'file-attachment',
      label: 'report.pdf',
      mediaType: 'application/octet-stream',
      path: '/tmp/storage-id'
    }
  ])
})

test('filesystem attachment labels come from paths', () => {
  expect(
    attachmentPart({
      type: 'file',
      mediaType: 'application/pdf',
      path: '/tmp/report.pdf'
    })
  ).toEqual({
    type: 'file-attachment',
    label: 'report.pdf',
    mediaType: 'application/pdf',
    path: '/tmp/report.pdf'
  })
  expect(
    attachmentPart(
      {
        type: 'file',
        mediaType: 'image/png',
        path: '/tmp/sketch.png',
        purpose: 'sketch'
      },
      'blob:preview'
    )
  ).toEqual({
    type: 'file-attachment',
    label: 'sketch.png',
    mediaType: 'image/png',
    path: '/tmp/sketch.png',
    previewUrl: 'blob:preview',
    purpose: 'sketch'
  })
})
