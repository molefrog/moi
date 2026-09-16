import type { MessageAttachment } from './types'
import { expect, test } from 'bun:test'
import { isMessageAttachments, partitionMessageAttachments } from './message-attachments'

test('partitions mixed attachments and leaves saved context payloads unchanged', () => {
  const context = { source: 'view:orders', label: 'Order', context: { id: '1042' } }
  const attachments: MessageAttachment[] = [
    { type: 'upload', uploadId: 'file' },
    { type: 'context', ...context },
    { type: 'upload', uploadId: 'drawing' }
  ]
  expect(isMessageAttachments(attachments)).toBe(true)
  expect(partitionMessageAttachments(attachments)).toEqual({
    uploadIds: ['file', 'drawing'],
    contextAttachments: [context]
  })
  expect(partitionMessageAttachments()).toEqual({ uploadIds: [], contextAttachments: [] })
})

test('rejects invalid variants, legacy ids, and invalid context in mixed requests', () => {
  for (const value of [
    null,
    ['file'],
    [{ type: 'upload' }],
    [{ type: 'upload', uploadId: '' }],
    [{ type: 'unknown' }],
    [{ type: 'context', label: 'Bad' }]
  ]) {
    expect(isMessageAttachments(value)).toBe(false)
  }
  const item = { type: 'context', source: 'view:orders', label: 'Order', context: {} }
  expect(isMessageAttachments(Array(20).fill(item))).toBe(true)
  expect(isMessageAttachments([{ ...item, context: { text: 'x'.repeat(5001) } }])).toBe(false)
  expect(isMessageAttachments([])).toBe(true)
})
