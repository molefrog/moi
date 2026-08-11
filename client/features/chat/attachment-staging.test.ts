import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'

import { stageAnnotation, stageAnnotationDraft } from './attachment-staging'
import { attachmentKey, liveStore } from './chat-store'

const workspaceId = 'workspace-1'
const sessionId = 'session-1'
const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  liveStore.getState().clearAttachments(workspaceId, sessionId)
  liveStore.setState({ attachments: {} })
})

describe('annotation draft staging', () => {
  test('stages locally without uploading and refreshes the preview per commit', () => {
    const revokeSpy = spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const fetchSpy = mock(() => Promise.reject(new Error('no network expected')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    stageAnnotationDraft({
      workspaceId,
      sessionId,
      localId: 'annotation-1',
      sourceTab: 'widgets',
      blob: new Blob(['first'], { type: 'image/png' })
    })
    const first = liveStore.getState().attachments[attachmentKey(workspaceId, sessionId)][0]
    expect(first.status).toBe('draft')
    expect(first.previewUrl).toStartWith('blob:')

    stageAnnotationDraft({
      workspaceId,
      sessionId,
      localId: 'annotation-1',
      sourceTab: 'widgets',
      blob: new Blob(['second'], { type: 'image/png' })
    })
    const list = liveStore.getState().attachments[attachmentKey(workspaceId, sessionId)]
    expect(list).toHaveLength(1)
    expect(list[0].previewUrl).not.toBe(first.previewUrl)
    expect(revokeSpy).toHaveBeenCalledWith(first.previewUrl)
    expect(fetchSpy).not.toHaveBeenCalled()
    revokeSpy.mockRestore()
  })

  test('upload on finish reuses the draft attachment and marks it ready', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        Response.json([{ id: 'upload-1', kind: 'image', mediaType: 'image/png' }], { status: 200 })
      )
    ) as unknown as typeof fetch

    stageAnnotationDraft({
      workspaceId,
      sessionId,
      localId: 'annotation-1',
      sourceTab: 'widgets',
      blob: new Blob(['drawing'], { type: 'image/png' })
    })
    await stageAnnotation({
      workspaceId,
      sessionId,
      localId: 'annotation-1',
      sourceTab: 'widgets',
      blob: new Blob(['drawing'], { type: 'image/png' }),
      isCurrent: () => true
    })

    const list = liveStore.getState().attachments[attachmentKey(workspaceId, sessionId)]
    expect(list).toHaveLength(1)
    expect(list[0].status).toBe('ready')
    expect(list[0].upload?.id).toBe('upload-1')
  })
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
    revokeSpy.mockRestore()
  })

  test('shows the annotation optimistically and removes it after an upload failure', async () => {
    const revokeSpy = spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Storage unavailable', { status: 503 }))
    ) as unknown as typeof fetch

    const upload = stageAnnotation({
      workspaceId,
      sessionId,
      localId: 'annotation-1',
      sourceTab: 'view:roadmap',
      blob: new Blob(['drawing'], { type: 'image/png' }),
      isCurrent: () => true
    })

    const optimisticAttachment =
      liveStore.getState().attachments[attachmentKey(workspaceId, sessionId)][0]
    expect(optimisticAttachment.status).toBe('uploading')
    expect(optimisticAttachment.previewUrl).toStartWith('blob:')

    await upload

    const attachment = liveStore.getState().attachments[attachmentKey(workspaceId, sessionId)][0]
    expect(attachment).toBeUndefined()
    expect(revokeSpy).toHaveBeenCalledWith(optimisticAttachment.previewUrl)
    revokeSpy.mockRestore()
  })
})
