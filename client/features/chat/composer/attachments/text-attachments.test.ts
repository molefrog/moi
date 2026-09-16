import { afterEach, describe, expect, test } from 'bun:test'
import { appletRuntime } from '../../../applets/applet-runtime'
import { stageTextAttachment, stageChatAttachment } from './draft-attachments'
import { attachmentKey, liveStore } from '../../chat-store'
import { attachmentsForSend, prepareDraftAttachments } from '../../chat-send'

const workspaceId = 'context-test'
const target = { workspaceId, sessionId: null }
const attachment = { source: 'view:orders', label: 'Order #1042', text: 'Order ID: 1042' }
afterEach(() => liveStore.setState({ attachments: {} }))

describe('text staging and sends', () => {
  test('stamps source, snapshots at the bridge and ignores disposed connections', () => {
    const runtime = appletRuntime(workspaceId)
    const off = runtime.on('addChatAttachment', value => {
      void stageChatAttachment(target, value)
    })
    const { bridge, dispose } = runtime.connect({ kind: 'view', name: 'orders' })
    const input = {
      type: 'text',
      label: 'Order',
      text: 'Status: pending',
      source: 'widget:forged'
    }
    bridge.addChatAttachment(input)
    input.text = 'Status: done'
    dispose()
    bridge.addChatAttachment({ type: 'text', label: 'Another', text: 'Order' })
    off()
    expect(attachmentsForSend(workspaceId, null)).toMatchObject([
      {
        kind: 'text',
        source: 'view:orders',
        label: 'Order',
        text: 'Status: pending'
      }
    ])
  })

  test('stages repeated text attachments without a limit', () => {
    stageTextAttachment(target, attachment)
    stageTextAttachment(target, structuredClone(attachment))
    expect(attachmentsForSend(workspaceId, null)).toHaveLength(2)
    for (let i = 1; i < 20; i++) stageTextAttachment(target, { ...attachment, text: String(i) })
    expect(attachmentsForSend(workspaceId, null)).toHaveLength(21)
    stageTextAttachment(target, attachment)
    expect(attachmentsForSend(workspaceId, null)).toHaveLength(22)
  })

  test('keeps chats isolated and follows session renames', () => {
    stageTextAttachment(target, attachment)
    stageTextAttachment(
      { workspaceId, sessionId: 'existing' },
      { ...attachment, label: 'Existing' }
    )
    expect(attachmentsForSend(workspaceId, 'different')).toEqual([])
    liveStore.getState().renameSession(workspaceId, 'existing', 'renamed')
    expect(attachmentsForSend(workspaceId, 'renamed')[0]).toMatchObject({
      kind: 'text',
      label: 'Existing'
    })
    expect(attachmentsForSend(workspaceId, null)[0]).toMatchObject({
      kind: 'text',
      label: attachment.label
    })
    liveStore.getState().clearAttachments(workspaceId, null)
    expect(attachmentsForSend(workspaceId, 'renamed')).toHaveLength(1)
  })

  test('an immediate send keeps new-chat text staged through both session id changes', () => {
    stageTextAttachment(target, attachment)
    stageTextAttachment(target, { ...attachment, label: 'Another order' })
    stageTextAttachment({ workspaceId, sessionId: 'other' }, { ...attachment, label: 'Other chat' })
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
    expect(attachmentsForSend(workspaceId, 'other')[0]).toMatchObject({
      kind: 'text',
      label: 'Other chat'
    })
  })

  test('sends text and drawings with their own metadata', () => {
    stageTextAttachment(target, attachment)
    liveStore.getState().addAttachments(workspaceId, null, [
      {
        kind: 'drawing',
        purpose: 'annotation',
        source: 'views/orders',
        localId: 'image',
        label: 'Annotation.png',
        mediaType: 'image/png',
        previewUrl: 'blob:annotation',
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
    expect(prepareDraftAttachments(ready)).toEqual({
      attachments: [
        { type: 'text', ...attachment },
        { type: 'upload', uploadId: 'up', source: 'views/orders', purpose: 'annotation' }
      ],
      parts: [
        { type: 'text-attachment', ...attachment },
        {
          type: 'file-attachment',
          label: 'Annotation.png',
          mediaType: 'image/png',
          previewUrl: 'blob:annotation',
          source: 'views/orders',
          purpose: 'annotation'
        }
      ]
    })
    expect(attachmentsForSend(workspaceId, null, { applet: { source: 'widget:clock' } })).toEqual(
      []
    )
    expect(liveStore.getState().attachments[attachmentKey(workspaceId, null)]).toHaveLength(2)
  })
})
