import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'

import { stageAnnotation } from './attachment-staging'
import { attachmentKey, liveStore } from './chat-store'
import type { AnnotationDocument } from '@/client/features/annotations/types'

const workspaceId = 'workspace-1'
const sessionId = 'session-1'
const originalFetch = globalThis.fetch
const document: AnnotationDocument = {
  width: 100,
  height: 100,
  history: { past: [], present: [{ points: [{ x: 10, y: 10 }] }], future: [] }
}

afterEach(() => {
  globalThis.fetch = originalFetch
  liveStore.getState().clearAttachments(workspaceId, sessionId)
  liveStore.setState({ attachments: {} })
})

describe('annotation attachment staging', () => {
  test('replaces the preview and only applies the latest upload result', async () => {
    const requests: Array<(response: Response) => void> = []
    const revokeSpy = spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    globalThis.fetch = mock(
      () => new Promise<Response>(resolve => requests.push(resolve))
    ) as unknown as typeof fetch
    let revision = 1

    const first = stageAnnotation({
      workspaceId,
      sessionId,
      localId: 'annotation-1',
      sourceTab: 'widgets',
      document,
      blob: new Blob(['first'], { type: 'image/png' }),
      isCurrent: () => revision === 1
    })
    const firstPreview =
      liveStore.getState().attachments[attachmentKey(workspaceId, sessionId)][0].previewUrl

    revision = 2
    const second = stageAnnotation({
      workspaceId,
      sessionId,
      localId: 'annotation-1',
      sourceTab: 'widgets',
      document,
      blob: new Blob(['second'], { type: 'image/png' }),
      isCurrent: () => revision === 2
    })
    const secondPreview =
      liveStore.getState().attachments[attachmentKey(workspaceId, sessionId)][0].previewUrl

    expect(secondPreview).not.toBe(firstPreview)
    expect(revokeSpy).toHaveBeenCalledWith(firstPreview)
    expect(liveStore.getState().attachments[attachmentKey(workspaceId, sessionId)][0].status).toBe(
      'uploading'
    )

    requests[1](
      Response.json([{ id: 'upload-2', kind: 'image', mediaType: 'image/png' }], { status: 200 })
    )
    await second
    requests[0](
      Response.json([{ id: 'upload-1', kind: 'image', mediaType: 'image/png' }], { status: 200 })
    )
    await first

    const attachment = liveStore.getState().attachments[attachmentKey(workspaceId, sessionId)][0]
    expect(attachment.status).toBe('ready')
    expect(attachment.upload?.id).toBe('upload-2')
    expect(attachment.document).toBe(document)
    revokeSpy.mockRestore()
  })

  test('keeps the latest preview in an error state after an upload failure', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Storage unavailable', { status: 503 }))
    ) as unknown as typeof fetch

    await stageAnnotation({
      workspaceId,
      sessionId,
      localId: 'annotation-1',
      sourceTab: 'view:roadmap',
      document,
      blob: new Blob(['drawing'], { type: 'image/png' }),
      isCurrent: () => true
    })

    const attachment = liveStore.getState().attachments[attachmentKey(workspaceId, sessionId)][0]
    expect(attachment.status).toBe('error')
    expect(attachment.previewUrl).toStartWith('blob:')
    expect(attachment.error).toBe('Storage unavailable')
  })
})
