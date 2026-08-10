import { expect, test } from 'bun:test'

import type { ChatAttachment } from '@/client/features/chat/chat-store'

import { findComposerAnnotation } from './useChatAnnotation'

const document = {
  width: 100,
  height: 100,
  history: { past: [], present: [], future: [] }
}

test('reuses the one annotation already staged for the composer', () => {
  const attachments: ChatAttachment[] = [
    {
      kind: 'file',
      localId: 'file-1',
      name: 'notes.txt',
      mediaType: 'text/plain',
      status: 'ready'
    },
    {
      kind: 'annotation',
      localId: 'annotation-1',
      sourceTab: 'widgets',
      document,
      name: 'Annotation.png',
      mediaType: 'image/png',
      status: 'ready'
    }
  ]

  expect(findComposerAnnotation(attachments)?.localId).toBe('annotation-1')
})
