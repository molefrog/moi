import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { toast } from '@/client/components/ui/toast'

import {
  stageDrawing,
  stageDrawingDraft,
  stageChatAttachment,
  stageTextAttachment
} from './draft-attachments'
import { attachmentsForSend } from '../../chat-send'
import * as appletLog from '../../../applets/applet-log'
import { attachmentKey, liveStore } from '../../chat-store'

const workspaceId = 'workspace-1'
const sessionId = 'session-1'
const originalFetch = globalThis.fetch
let notices: ReturnType<typeof spyOn<typeof toast, 'add'>>

beforeEach(() => {
  notices = spyOn(toast, 'add').mockImplementation(() => crypto.randomUUID())
})

function drawingAttachments() {
  return (liveStore.getState().attachments[attachmentKey(workspaceId, sessionId)] ?? []).filter(
    a => a.kind !== 'text'
  )
}

afterEach(() => {
  notices.mockRestore()
  globalThis.fetch = originalFetch
  liveStore.getState().clearAttachments(workspaceId, sessionId)
  liveStore.setState({ attachments: {} })
})

describe('drawing draft staging', () => {
  test('stages locally without uploading and refreshes the preview per commit', () => {
    const revokeSpy = spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const fetchSpy = mock(() => Promise.reject(new Error('no network expected')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    stageDrawingDraft({
      workspaceId,
      sessionId,
      localId: 'annotation-1',
      purpose: 'annotation',
      source: 'overview',
      blob: new Blob(['first'], { type: 'image/png' })
    })
    const first = drawingAttachments()[0]
    expect(first.status).toBe('draft')
    expect(first.previewUrl).toStartWith('blob:')

    stageDrawingDraft({
      workspaceId,
      sessionId,
      localId: 'annotation-1',
      purpose: 'annotation',
      source: 'overview',
      blob: new Blob(['second'], { type: 'image/png' })
    })
    const list = drawingAttachments()
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

    stageDrawingDraft({
      workspaceId,
      sessionId,
      localId: 'annotation-1',
      purpose: 'annotation',
      source: 'overview',
      blob: new Blob(['drawing'], { type: 'image/png' })
    })
    await stageDrawing({
      workspaceId,
      sessionId,
      localId: 'annotation-1',
      purpose: 'annotation',
      source: 'overview',
      blob: new Blob(['drawing'], { type: 'image/png' }),
      isCurrent: () => true
    })

    const list = drawingAttachments()
    expect(list).toHaveLength(1)
    expect(list[0].status).toBe('ready')
    expect(list[0].upload?.id).toBe('upload-1')
  })
})

describe('drawing attachment staging', () => {
  test('replaces the preview and only applies the latest upload result', async () => {
    const requests: Array<(response: Response) => void> = []
    const revokeSpy = spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    globalThis.fetch = mock(
      () => new Promise<Response>(resolve => requests.push(resolve))
    ) as unknown as typeof fetch
    let revision = 1

    const first = stageDrawing({
      workspaceId,
      sessionId,
      localId: 'annotation-1',
      purpose: 'annotation',
      source: 'overview',
      blob: new Blob(['first'], { type: 'image/png' }),
      isCurrent: () => revision === 1
    })
    const firstPreview = drawingAttachments()[0].previewUrl

    revision = 2
    const second = stageDrawing({
      workspaceId,
      sessionId,
      localId: 'annotation-1',
      purpose: 'annotation',
      source: 'overview',
      blob: new Blob(['second'], { type: 'image/png' }),
      isCurrent: () => revision === 2
    })
    const secondPreview = drawingAttachments()[0].previewUrl

    expect(secondPreview).not.toBe(firstPreview)
    expect(revokeSpy).toHaveBeenCalledWith(firstPreview)
    expect(drawingAttachments()[0].status).toBe('uploading')

    requests[1](
      Response.json([{ id: 'upload-2', kind: 'image', mediaType: 'image/png' }], { status: 200 })
    )
    await second
    requests[0](
      Response.json([{ id: 'upload-1', kind: 'image', mediaType: 'image/png' }], { status: 200 })
    )
    await first

    const attachment = drawingAttachments()[0]
    expect(attachment.status).toBe('ready')
    expect(attachment.upload?.id).toBe('upload-2')
    revokeSpy.mockRestore()
  })

  test('shows the annotation optimistically and removes it after an upload failure', async () => {
    const revokeSpy = spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Storage unavailable', { status: 503 }))
    ) as unknown as typeof fetch

    const upload = stageDrawing({
      workspaceId,
      sessionId,
      localId: 'annotation-1',
      purpose: 'annotation',
      source: 'view:roadmap',
      blob: new Blob(['drawing'], { type: 'image/png' }),
      isCurrent: () => true
    })

    const optimisticAttachment = drawingAttachments()[0]
    expect(optimisticAttachment.status).toBe('uploading')
    expect(optimisticAttachment.previewUrl).toStartWith('blob:')

    await upload

    const attachment = drawingAttachments()[0]
    expect(attachment).toBeUndefined()
    expect(revokeSpy).toHaveBeenCalledWith(optimisticAttachment.previewUrl)
    revokeSpy.mockRestore()
  })

  test('uses sketch copy and purpose for a builder drawing', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        Response.json([{ id: 'upload-sketch', kind: 'image', mediaType: 'image/png' }])
      )
    ) as unknown as typeof fetch

    await stageDrawing({
      workspaceId,
      sessionId,
      localId: 'sketch-1',
      purpose: 'sketch',
      source: 'view-builder:draft-1',
      blob: new Blob(['drawing'], { type: 'image/png' }),
      isCurrent: () => true
    })

    const attachment = drawingAttachments()[0]
    expect(attachment.kind).toBe('drawing')
    expect(attachment.label).toBe('Sketch.png')
    expect(attachment.kind === 'drawing' ? attachment.purpose : null).toBe('sketch')
  })
})

describe('applet file staging', () => {
  test.each(['browser', 'path'] as const)(
    '%s uploads follow both renames and keep their original chat',
    async source => {
      const requests: Array<{
        url: string
        init?: RequestInit
        resolve: (response: Response) => void
      }> = []
      globalThis.fetch = mock(
        (url: string, init?: RequestInit) =>
          new Promise<Response>(resolve => {
            requests.push({ url, init, resolve })
          })
      ) as unknown as typeof fetch
      const input =
        source === 'browser'
          ? {
              type: 'file' as const,
              file: new File(['snapshot'], 'notes.txt', { type: 'text/plain' }),
              source: 'view:files'
            }
          : { type: 'file' as const, path: 'reports/notes.txt', source: 'view:files' }
      const pending = stageChatAttachment({ workspaceId, sessionId: null }, input)
      expect(attachmentsForSend(workspaceId, null)).toEqual([])
      expect(liveStore.getState().attachments[attachmentKey(workspaceId, null)][0]).toMatchObject({
        label: 'notes.txt',
        status: 'uploading'
      })
      if (source === 'path') {
        expect(requests[0].url).toEndWith('/uploads/from-path')
        expect(JSON.parse(requests[0].init?.body as string)).toEqual({ path: 'reports/notes.txt' })
      } else {
        const form = requests[0].init?.body as FormData
        expect(await (form.get('files') as File).text()).toBe('snapshot')
      }
      liveStore.getState().renameSession(workspaceId, null, 'temporary')
      liveStore.getState().renameSession(workspaceId, 'temporary', 'real')
      stageTextAttachment(
        { workspaceId, sessionId: 'other' },
        { label: 'Other', text: 'Other chat', source: 'view:files' }
      )
      const info = {
        id: 'upload',
        filename: 'notes.txt',
        kind: 'file',
        mediaType: 'text/plain',
        size: 8
      }
      requests[0].resolve(Response.json(source === 'browser' ? [info] : info))
      await pending
      expect(attachmentsForSend(workspaceId, 'real')).toMatchObject([
        { kind: 'file', source: 'view:files', status: 'ready', upload: info }
      ])
      expect(attachmentsForSend(workspaceId, 'other')).toHaveLength(1)
      expect(attachmentsForSend(workspaceId, null)).toEqual([])
      expect(attachmentsForSend(workspaceId, 'real', { applet: { source: 'view:files' } })).toEqual(
        []
      )
    }
  )

  test('a removed upload never returns, even after the chat is renamed', async () => {
    let complete!: (response: Response) => void
    globalThis.fetch = mock(
      () =>
        new Promise<Response>(resolve => {
          complete = resolve
        })
    ) as unknown as typeof fetch
    const pending = stageChatAttachment(
      { workspaceId, sessionId },
      { type: 'file', path: 'image.png', source: 'view:files' }
    )
    const id = drawingAttachments()[0].localId
    liveStore.getState().renameSession(workspaceId, sessionId, 'real')
    liveStore.getState().removeAttachment(workspaceId, id)
    complete(
      Response.json({
        id: 'upload',
        filename: 'image.png',
        kind: 'image',
        mediaType: 'image/png',
        size: 1
      })
    )
    await pending
    expect(attachmentsForSend(workspaceId, 'real')).toEqual([])
    expect(attachmentsForSend(workspaceId, sessionId)).toEqual([])
  })

  test.each(['browser', 'path'] as const)(
    '%s failures remove only the failed upload and show a toast',
    async source => {
      const log = spyOn(appletLog, 'reportAppletError').mockImplementation(() => {})
      const revoke = spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      const response = Promise.withResolvers<Response>()
      globalThis.fetch = mock(() => response.promise) as unknown as typeof fetch
      stageTextAttachment(
        { workspaceId, sessionId },
        { label: 'Keep', text: 'Keep this attachment', source: 'view:files' }
      )
      const kept = attachmentsForSend(workspaceId, sessionId)
      const pending = stageChatAttachment(
        { workspaceId, sessionId },
        source === 'browser'
          ? {
              type: 'file',
              file: new File(['image'], 'image.png', { type: 'image/png' }),
              source: 'view:files'
            }
          : { type: 'file', path: 'missing.pdf', source: 'view:files' }
      )
      const failed = drawingAttachments()[0]
      expect(failed.status).toBe('uploading')
      liveStore.getState().renameSession(workspaceId, sessionId, 'real')
      response.resolve(new Response('The file couldn’t be uploaded', { status: 400 }))
      await pending
      expect(liveStore.getState().attachments[attachmentKey(workspaceId, 'real')]).toEqual(kept)
      expect(notices).toHaveBeenCalledWith({
        title: `Couldn’t add ${failed.label}`,
        description: 'The file couldn’t be uploaded',
        type: 'error'
      })
      if (failed.previewUrl) expect(revoke).toHaveBeenCalledWith(failed.previewUrl)
      expect(log).toHaveBeenCalledWith(workspaceId, {
        source: 'runtime',
        message: 'addChatAttachment() from view:files: The file couldn’t be uploaded'
      })
      log.mockRestore()
      revoke.mockRestore()
    }
  )

  test('path images get an upload preview', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        Response.json({ id: 'img', filename: 'image.png', kind: 'image', mediaType: 'image/png' })
      )
    ) as unknown as typeof fetch
    await stageChatAttachment(
      { workspaceId, sessionId },
      { type: 'file', path: 'image.png', source: 'view:files' }
    )
    expect(drawingAttachments()[0].previewUrl).toBe(`/api/workspaces/${workspaceId}/uploads/img`)
  })
})

test('drawing edits and final upload reuse the moved draft after a session rename', async () => {
  globalThis.fetch = mock(() =>
    Promise.resolve(
      Response.json([{ id: 'drawing-upload', kind: 'image', mediaType: 'image/png' }])
    )
  ) as unknown as typeof fetch
  const draft = {
    workspaceId,
    sessionId: null,
    localId: 'renamed-drawing',
    purpose: 'annotation' as const,
    source: 'overview' as const,
    blob: new Blob(['drawing'], { type: 'image/png' })
  }
  stageDrawingDraft(draft)
  liveStore.getState().renameSession(workspaceId, null, 'temporary')
  stageDrawingDraft({ ...draft, blob: new Blob(['edited'], { type: 'image/png' }) })
  liveStore.getState().renameSession(workspaceId, 'temporary', 'real')
  await stageDrawing({ ...draft, isCurrent: () => true })
  expect(attachmentsForSend(workspaceId, null)).toEqual([])
  expect(attachmentsForSend(workspaceId, 'real')).toMatchObject([
    { kind: 'drawing', localId: draft.localId, status: 'ready' }
  ])
})
