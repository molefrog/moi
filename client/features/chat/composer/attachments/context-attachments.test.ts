import { afterEach, describe, expect, test } from 'bun:test'
import { appletRuntime } from '../../../applets/applet-runtime'
import { stageChatContext } from './draft-attachments'
import { attachmentKey, liveStore } from '../../chat-store'
import {
  attachmentsForSend,
  attachmentPartsForOptimisticTurn,
  withAttachmentDirectives
} from '../../chat-send'

const workspaceId = 'context-test'
const target = { workspaceId, sessionId: null }
const attachment = { source: 'view:orders', label: 'Order #1042', context: { orderId: '1042' } }
afterEach(() => liveStore.setState({ attachments: {} }))

describe('context staging and sends', () => {
  test('stamps source, snapshots at the bridge and ignores disposed connections', () => {
    const runtime = appletRuntime(workspaceId)
    const off = runtime.on('addChatContext', value => {
      stageChatContext(target, value)
    })
    const { bridge, dispose } = runtime.connect({ kind: 'view', name: 'orders' })
    const input = { label: 'Order', context: { status: 'pending' }, source: 'widget:forged' }
    bridge.addChatContext(input)
    input.context.status = 'done'
    dispose()
    bridge.addChatContext({ label: 'Another', context: {} })
    off()
    expect(attachmentsForSend(workspaceId, null)).toMatchObject([
      {
        kind: 'context',
        attachment: { source: 'view:orders', label: 'Order', context: { status: 'pending' } }
      }
    ])
  })

  test('skips identical repeats and stages more than ten different payloads', () => {
    stageChatContext(target, attachment)
    stageChatContext(target, structuredClone(attachment))
    expect(attachmentsForSend(workspaceId, null)).toHaveLength(1)
    for (let i = 1; i < 20; i++)
      stageChatContext(target, { ...attachment, context: { orderId: String(i) } })
    expect(attachmentsForSend(workspaceId, null)).toHaveLength(20)
    stageChatContext(target, attachment)
    expect(attachmentsForSend(workspaceId, null)).toHaveLength(20)
  })

  test('keeps chats isolated and follows session renames', () => {
    stageChatContext(target, attachment)
    stageChatContext({ workspaceId, sessionId: 'existing' }, { ...attachment, label: 'Existing' })
    expect(attachmentsForSend(workspaceId, 'different')).toEqual([])
    liveStore.getState().renameSession(workspaceId, 'existing', 'renamed')
    expect(attachmentsForSend(workspaceId, 'renamed')[0].name).toBe('Existing')
    expect(attachmentsForSend(workspaceId, null)[0].name).toBe(attachment.label)
    liveStore.getState().clearAttachments(workspaceId, null)
    expect(attachmentsForSend(workspaceId, 'renamed')).toHaveLength(1)
  })

  test('an immediate send keeps new-chat context staged through both session id changes', () => {
    stageChatContext(target, attachment)
    stageChatContext(target, { ...attachment, label: 'Another order' })
    stageChatContext({ workspaceId, sessionId: 'other' }, { ...attachment, label: 'Other chat' })
    const staged = attachmentsForSend(workspaceId, null)
    const options = { applet: { source: 'view:orders' } }

    expect(attachmentsForSend(workspaceId, null, options)).toEqual([])
    liveStore.getState().renameSession(workspaceId, null, 'temporary')
    expect(attachmentsForSend(workspaceId, null)).toEqual([])
    expect(attachmentsForSend(workspaceId, 'temporary')).toEqual(staged)
    expect(attachmentsForSend(workspaceId, 'temporary', options)).toEqual([])

    liveStore.getState().renameSession(workspaceId, 'temporary', 'real')
    expect(attachmentsForSend(workspaceId, 'temporary')).toEqual([])
    expect(attachmentsForSend(workspaceId, 'real')).toEqual(staged)
    liveStore.getState().clearAttachments(workspaceId, 'real')
    expect(attachmentsForSend(workspaceId, 'real')).toEqual([])
    expect(attachmentsForSend(workspaceId, 'other')[0].name).toBe('Other chat')
  })

  test('sends context with uploads without changing annotation image positions', () => {
    stageChatContext(target, attachment)
    liveStore.getState().addAttachments(workspaceId, null, [
      {
        kind: 'drawing',
        purpose: 'annotation',
        sourceTab: 'view:orders',
        localId: 'image',
        name: 'Annotation.png',
        mediaType: 'image/png',
        status: 'ready',
        upload: {
          id: 'up',
          kind: 'image',
          mediaType: 'image/png',
          filename: 'Annotation.png',
          size: 1
        }
      }
    ])
    const ready = attachmentsForSend(workspaceId, null)
    expect(ready).toHaveLength(2)
    expect(attachmentPartsForOptimisticTurn(ready)[0]).toEqual({ type: 'context', ...attachment })
    expect(withAttachmentDirectives(undefined, ready)?.directives).toEqual([
      'Annotation attachment sources in attachment order: 1. "view:orders".'
    ])
    expect(attachmentsForSend(workspaceId, null, { applet: { source: 'widget:clock' } })).toEqual(
      []
    )
    expect(liveStore.getState().attachments[attachmentKey(workspaceId, null)]).toHaveLength(2)
  })
})
