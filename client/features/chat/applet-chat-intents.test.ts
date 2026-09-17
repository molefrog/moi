import { afterEach, beforeEach, describe, expect, test, mock, spyOn } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { appUiKeys } from '@/client/api/app-ui-keys'
import { toast } from '@/client/components/ui/toast'
import * as appletLog from '@/client/features/applets/applet-log'
import type { AppletChatMessage } from '@/client/features/applets/applet-runtime'
import { type ChatSendOptions, ownsComposerAttachments, attachmentsForSend } from './chat-send'
import { liveStore } from './chat-store'
import { stageTextAttachment } from './composer/attachments/draft-attachments'
import type { SelectedSessionState, UploadInfo } from '@/lib/types'
import { drainChatDirectives, pushChatDirective } from '@/client/features/workspace/moi-context'

import { canSubmitComposerAction } from '@/client/components/shared/Composer'
import {
  appletSendBlockedReason,
  createAppletMessageHandler
} from '@/client/features/chat/applet-chat-intents'
import type { AgentAvailability } from '@/client/lib/agent-availability'

// An applet message must not start a run the composer's own send button would
// have refused, including while the availability query is still in flight.
describe('appletSendBlockedReason', () => {
  test('a resolved-available workspace sends', () => {
    expect(appletSendBlockedReason({ status: 'available' })).toBeNull()
  })

  test('an unavailable workspace is reported without server details', () => {
    expect(appletSendBlockedReason({ status: 'unavailable', reason: 'Runtime missing' })).toBe(
      "this workspace's agent is unavailable"
    )
  })

  test('reports disconnected and login-required workspaces precisely', () => {
    expect(appletSendBlockedReason({ status: 'disconnected' })).toBe(
      'this workspace is disconnected from moi'
    )
    expect(
      appletSendBlockedReason({
        status: 'login-required',
        reason: 'Sign in'
      })
    ).toBe("this workspace's agent needs a login")
  })

  test('an unresolved availability query blocks', () => {
    expect(appletSendBlockedReason({ status: 'checking' })).toBe(
      "this workspace's agent availability has not resolved yet"
    )
  })

  test('agrees with the composer button on every availability state', () => {
    const states: AgentAvailability[] = [
      { status: 'available' },
      { status: 'checking' },
      { status: 'disconnected' },
      {
        status: 'login-required',
        reason: 'Sign in'
      },
      { status: 'unavailable', reason: 'Runtime missing' }
    ]
    for (const availability of states) {
      const composerWouldSend = canSubmitComposerAction(true, false, availability)
      expect(appletSendBlockedReason(availability) === null).toBe(composerWouldSend)
    }
  })
})

// Exercise the actual async handler with deferred uploads and the real selection
// cache, including changes that happen without an intervening React render.
describe('immediate applet sends', () => {
  const workspaceId = 'immediate-send-test'
  const originalFetch = globalThis.fetch
  let handler: ReturnType<typeof createAppletMessageHandler>
  let queryClient: QueryClient
  let availability: AgentAvailability
  let send: ReturnType<typeof mock<(message: string, options?: ChatSendOptions) => void>>
  let reveal: ReturnType<typeof mock<() => void>>
  let notices: ReturnType<typeof spyOn<typeof toast, 'add'>>
  let close: ReturnType<typeof spyOn<typeof toast, 'close'>>
  let log: ReturnType<typeof spyOn<typeof appletLog, 'reportAppletError'>>

  function select(sessionId: string | null) {
    queryClient.setQueryData(appUiKeys.selectedSession(workspaceId), { sessionId })
  }
  function deferredUpload() {
    const deferred = Promise.withResolvers<Response>()
    globalThis.fetch = mock(() => deferred.promise) as unknown as typeof fetch
    return deferred
  }
  const upload: UploadInfo = {
    id: 'upload-1',
    kind: 'file',
    filename: 'report.pdf',
    mediaType: 'application/pdf',
    size: 20
  }
  const event: AppletChatMessage = {
    message: 'Review',
    source: 'view:orders',
    attachments: [{ type: 'file', path: 'report.pdf', source: 'view:orders' }]
  }

  beforeEach(() => {
    queryClient = new QueryClient()
    select('session-1')
    availability = { status: 'available' }
    send = mock(() => {})
    reveal = mock(() => {})
    notices = spyOn(toast, 'add').mockImplementation(() => crypto.randomUUID())
    close = spyOn(toast, 'close').mockImplementation(() => {})
    log = spyOn(appletLog, 'reportAppletError').mockImplementation(() => {})
    handler = createAppletMessageHandler(workspaceId, queryClient, () => ({
      sessionId:
        queryClient.getQueryData<SelectedSessionState>(appUiKeys.selectedSession(workspaceId))
          ?.sessionId ?? null,
      send,
      revealChat: reveal,
      agentAvailability: availability
    }))
  })
  afterEach(() => {
    handler.dispose()
    queryClient.clear()
    globalThis.fetch = originalFetch
    notices.mockRestore()
    close.mockRestore()
    log.mockRestore()
    liveStore.setState({ attachments: {} })
  })

  test('message-only sends preserve attribution and do not show a loading toast', async () => {
    await handler.handle({ ...event, attachments: [] })
    expect(reveal).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('Review', {
      applet: { source: 'view:orders' },
      preparedAttachments: { attachments: [], parts: [] }
    })
    expect(notices).not.toHaveBeenCalled()
  })

  test('prepares all three inputs in order without deduplication or draft mutations', async () => {
    const delayed = Promise.withResolvers<Response>()
    const requests: [string, RequestInit | undefined][] = []
    globalThis.fetch = mock((url: string, init?: RequestInit) => {
      requests.push([url, init])
      return url.endsWith('/from-path') ? Promise.resolve(Response.json(upload)) : delayed.promise
    }) as unknown as typeof fetch
    stageTextAttachment(
      { workspaceId, sessionId: 'session-1' },
      { source: 'view:draft', label: 'Keep', text: 'draft' }
    )
    const draft = liveStore.getState().attachments
    const text = { type: 'text' as const, source: 'view:orders', label: 'Order', text: 'Details' }
    const pending = handler.handle({
      ...event,
      attachments: [
        text,
        {
          type: 'file',
          file: new File(['image'], 'image.png', { type: 'image/png' }),
          source: event.source
        },
        ...event.attachments,
        text
      ]
    })
    expect(send).not.toHaveBeenCalled()
    expect(reveal).toHaveBeenCalledTimes(1)
    expect(notices.mock.calls[0][0]).toMatchObject({ type: 'loading', timeout: 0 })
    expect(liveStore.getState().attachments).toBe(draft)
    delayed.resolve(
      Response.json([
        { ...upload, id: 'image-1', kind: 'image', filename: 'image.png', mediaType: 'image/png' }
      ])
    )
    await pending
    expect(liveStore.getState().attachments).toBe(draft)
    const options = send.mock.calls[0][1]!
    expect(ownsComposerAttachments(options)).toBe(false)
    expect(attachmentsForSend(workspaceId, 'session-1', options)).toEqual([])
    expect(options.preparedAttachments).toEqual({
      attachments: [
        text,
        { type: 'upload', uploadId: 'image-1' },
        { type: 'upload', uploadId: 'upload-1' },
        text
      ],
      parts: [
        { ...text, type: 'text-attachment' },
        {
          type: 'file-attachment',
          filename: 'image.png',
          mediaType: 'image/png',
          url: `/api/workspaces/${workspaceId}/uploads/image-1`
        },
        { type: 'file-attachment', filename: 'report.pdf', mediaType: 'application/pdf', url: '' },
        { ...text, type: 'text-attachment' }
      ]
    })
    expect(requests[0][1]?.body).toBeInstanceOf(FormData)
    expect(requests[1][1]?.body).toBe(JSON.stringify({ path: 'report.pdf' }))
    expect(close).toHaveBeenCalledTimes(1)
  })

  test('one failed file prevents the whole send and reports the failure', async () => {
    globalThis.fetch = mock((url: string, init?: RequestInit) =>
      Promise.resolve(
        String(init?.body).includes('missing')
          ? new Response('File not found', { status: 404 })
          : Response.json(upload)
      )
    ) as unknown as typeof fetch
    await handler.handle({
      ...event,
      attachments: [
        ...event.attachments,
        { type: 'file', path: 'missing.pdf', source: event.source }
      ]
    })
    expect(send).not.toHaveBeenCalled()
    expect(notices.mock.calls.at(-1)?.[0]).toMatchObject({
      type: 'error',
      description: 'File not found'
    })
    expect(log.mock.calls[0][1].message).toContain('view:orders: File not found')
    expect(close).toHaveBeenCalledTimes(1)
  })

  for (const transition of ['switch', 'switch-back', 'rename', 'new-chat-id', 'unmount'] as const) {
    test(`cancels permanently on ${transition}`, async () => {
      if (transition === 'new-chat-id') select(null)
      const upload = deferredUpload()
      const pending = handler.handle(event)
      if (transition === 'unmount') handler.dispose()
      else {
        select('session-2')
        if (transition === 'switch-back') select('session-1')
      }
      expect(notices.mock.calls.at(-1)?.[0]).toMatchObject({ title: 'Message canceled' })
      expect(close).toHaveBeenCalledTimes(1)
      upload.resolve(Response.json({ id: 'ignored' }))
      await pending
      expect(send).not.toHaveBeenCalled()
      expect(log).not.toHaveBeenCalled()
      expect(close).toHaveBeenCalledTimes(1)
    })
  }

  test('ignores an upload rejection after cancellation', async () => {
    const upload = deferredUpload()
    const pending = handler.handle(event)
    select(null)
    upload.reject(new Error('late failure'))
    await pending
    expect(send).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
    expect(notices.mock.calls.filter(([notice]) => notice.type === 'error')).toHaveLength(0)
  })

  test('rechecks availability after uploads', async () => {
    const deferred = deferredUpload()
    const pending = handler.handle(event)
    availability = { status: 'disconnected' }
    deferred.resolve(Response.json(upload))
    await pending
    expect(send).not.toHaveBeenCalled()
    expect(notices.mock.calls.at(-1)?.[0]).toMatchObject({
      type: 'error',
      description: 'this workspace is disconnected from moi'
    })
  })

  test('unavailable agents do not start uploads', async () => {
    const fetch = mock(() => Promise.reject(new Error('unexpected request')))
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch
    availability = { status: 'checking' }
    await handler.handle(event)
    expect(fetch).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  test('a stale rendered send callback cannot target a previously selected chat', async () => {
    handler.dispose()
    handler = createAppletMessageHandler(workspaceId, queryClient, () => ({
      sessionId: 'old-session',
      send,
      revealChat: reveal,
      agentAvailability: availability
    }))
    const fetch = mock(() => Promise.reject(new Error('unexpected upload')))
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch
    await handler.handle(event)
    expect(fetch).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(notices.mock.calls.at(-1)?.[0]).toMatchObject({ title: 'Message canceled' })
  })

  test('one-shot directives wait for an actual send after cancellation', async () => {
    pushChatDirective(workspaceId, 'Preserve this instruction')
    send.mockImplementation(() => {
      expect(drainChatDirectives(workspaceId)).toEqual(['Preserve this instruction'])
    })
    const deferred = deferredUpload()
    const pending = handler.handle(event)
    select('session-2')
    deferred.resolve(Response.json(upload))
    await pending
    expect(send).not.toHaveBeenCalled()
    await handler.handle({ ...event, attachments: [] })
    expect(send).toHaveBeenCalledTimes(1)
    expect(drainChatDirectives(workspaceId)).toEqual([])
  })

  test('the send itself may assign a new session ID without a cancellation notice', async () => {
    select(null)
    send.mockImplementation(() => select('minted-session'))
    await handler.handle({ ...event, attachments: [] })
    expect(send).toHaveBeenCalledTimes(1)
    expect(notices).not.toHaveBeenCalled()
  })
})
