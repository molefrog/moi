import type { MessageAttachment } from './types'
import { expect, test } from 'bun:test'
import { MAX_MESSAGE_ATTACHMENTS, isMessageAttachments } from './message-attachments'

test('accepts mixed attachment references', () => {
  const context = { source: 'view:orders', label: 'Order', text: 'Order ID: 1042' }
  const attachments: MessageAttachment[] = [
    { type: 'upload', uploadId: 'file' },
    { type: 'text', ...context },
    { type: 'text', label: 'Note', text: 'Context without an applet origin' },
    { type: 'text', label: 'Overview', text: 'Workspace context', source: 'overview' },
    { type: 'upload', uploadId: 'drawing', source: 'overview', purpose: 'annotation' }
  ]
  expect(isMessageAttachments(attachments)).toBe(true)
})

test('rejects invalid variants, legacy ids, and invalid context in mixed requests', () => {
  for (const value of [
    null,
    ['file'],
    [{ type: 'upload' }],
    [{ type: 'upload', uploadId: '' }],
    [{ type: 'upload', uploadId: 'file', source: 42 }],
    [{ type: 'text', label: 'Note', text: 'Context', source: 42 }],
    [{ type: 'text', label: 'Note', text: 'Context', source: '' }],
    [{ type: 'upload', uploadId: 'file', purpose: 'unknown' }],
    [{ type: 'image', uploadId: 'image', purpose: 'unknown' }],
    [{ type: 'image', uploadId: '' }],
    [{ type: 'image', uploadId: 'image', source: 42 }],
    [{ type: 'unknown' }],
    [{ type: 'text', label: 'Bad' }]
  ]) {
    expect(isMessageAttachments(value)).toBe(false)
  }
  expect(isMessageAttachments([{ type: 'upload', uploadId: 'image', purpose: 'sketch' }])).toBe(
    true
  )
  const item = { type: 'text', source: 'view:orders', label: 'Order', text: 'Order' }
  expect(isMessageAttachments(Array(MAX_MESSAGE_ATTACHMENTS).fill(item))).toBe(true)
  expect(isMessageAttachments(Array(MAX_MESSAGE_ATTACHMENTS + 1).fill(item))).toBe(false)
  expect(isMessageAttachments([{ ...item, text: 'x'.repeat(5001) }])).toBe(false)
  expect(isMessageAttachments([{ ...item, purpose: 'sketch' }])).toBe(false)
  expect(isMessageAttachments([])).toBe(true)
})
