import type { MessageAttachment } from './types'
import { expect, test } from 'bun:test'
import { isMessageAttachments, partitionMessageAttachments } from './message-attachments'

test('partitions mixed attachments and leaves saved context payloads unchanged', () => {
  const context = { source: 'view:orders', label: 'Order', text: 'Order ID: 1042' }
  const attachments: MessageAttachment[] = [
    { type: 'upload', uploadId: 'file' },
    { type: 'text', ...context },
    { type: 'upload', uploadId: 'drawing' }
  ]
  expect(isMessageAttachments(attachments)).toBe(true)
  expect(partitionMessageAttachments(attachments)).toEqual({
    uploadIds: ['file', 'drawing'],
    textAttachments: [context]
  })
  expect(partitionMessageAttachments()).toEqual({ uploadIds: [], textAttachments: [] })
})

test('rejects invalid variants, legacy ids, and invalid context in mixed requests', () => {
  for (const value of [
    null,
    ['file'],
    [{ type: 'upload' }],
    [{ type: 'upload', uploadId: '' }],
    [{ type: 'unknown' }],
    [{ type: 'text', label: 'Bad' }]
  ]) {
    expect(isMessageAttachments(value)).toBe(false)
  }
  const item = { type: 'text', source: 'view:orders', label: 'Order', text: 'Order' }
  expect(isMessageAttachments(Array(20).fill(item))).toBe(true)
  expect(isMessageAttachments([{ ...item, text: 'x'.repeat(5001) }])).toBe(false)
  expect(isMessageAttachments([])).toBe(true)
})
