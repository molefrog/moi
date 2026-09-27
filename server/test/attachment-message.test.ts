import { describe, expect, test } from 'bun:test'
import sharp from 'sharp'
import { appendAttachments, replayAttachmentParts, splitAttachments } from '@/lib/moi-attachments'
import { appendAttachmentNote } from '@/lib/attachment-note'
import { formatChatTitle } from '@/lib/chat-title'
import type { MessageAttachment, Part } from '@/lib/types'
import {
  AttachmentUploadError,
  materializeAttachmentPaths,
  prepareAttachmentMessage
} from '../attachment-message'
import { addUpload, resolveUploads } from '../uploads'
import { buildUserMessage } from '../harness/claude-code/session'
import { ClaudeAdapter } from '../harness/claude-code/adapter'
import { codexItemToTurn } from '../harness/codex/adapter'
import { messageToTurn } from '../harness/openclaw/adapter'
import { normalizeEchoText, userEchoKey } from '../harness/openclaw/session'
import { replayedUserParts } from '../harness/acp/adapter'

async function mixedAttachments(workspaceId: string): Promise<MessageAttachment[]> {
  const file = await addUpload({
    workspaceId,
    filename: 'report.txt',
    mediaType: 'text/plain',
    bytes: Buffer.from('Report')
  })
  const images = await Promise.all(
    ['red', 'blue'].map(async background =>
      addUpload({
        workspaceId,
        filename: 'Drawing.png',
        mediaType: 'image/png',
        bytes: await sharp({ create: { width: 2, height: 2, channels: 3, background } })
          .png()
          .toBuffer()
      })
    )
  )
  return [
    { type: 'upload', uploadId: images[0].id, source: 'view:orders', purpose: 'annotation' },
    { type: 'text', source: 'widget:orders', label: 'Order', text: 'Order #1042' },
    { type: 'upload', uploadId: file.id, source: 'widget:orders' },
    { type: 'upload', uploadId: images[1].id, source: 'view-builder:orders', purpose: 'sketch' }
  ]
}

describe('shared attachment messages', () => {
  test('file uploads retain their source without acquiring drawing purpose', async () => {
    const workspaceId = 'file-purpose'
    const upload = await addUpload({
      workspaceId,
      filename: 'report.txt',
      mediaType: 'text/plain',
      bytes: Buffer.from('Report')
    })
    const prepared = prepareAttachmentMessage(workspaceId, '', [
      { type: 'upload', uploadId: upload.id, source: 'widget:orders', purpose: 'sketch' }
    ])
    expect(prepared.attachments[0]).toMatchObject({ type: 'file', source: 'widget:orders' })
    expect(prepared.attachments[0]).not.toHaveProperty('purpose')
    expect(prepared.attachments[0]).not.toHaveProperty('label')
    expect(prepared.parts[0]).toMatchObject({ label: 'report.txt' })
    expect(prepared.text).not.toContain('"label"')
    expect(prepared.parts[0]).not.toHaveProperty('purpose')
    expect(prepared.text).not.toContain('purpose')
  })

  for (const text of ['Review these', '']) {
    test(`native images and metadata replay across Claude, Codex and ACP: ${text || 'attachments only'}`, async () => {
      const workspaceId = `mixed-${text}`
      const inputs = await mixedAttachments(workspaceId)
      const prepared = prepareAttachmentMessage(workspaceId, text, inputs)
      const nativeImages = prepared.attachments.filter(a => a.type === 'image' && 'data' in a)
      const images: Part[] = nativeImages.map(image => ({
        type: 'file-attachment',
        mediaType: image.mediaType,
        previewUrl: `data:${image.mediaType};base64,${image.data.toString('base64')}`
      }))
      const expected = prepared.parts.map(part => {
        if (part.type !== 'file-attachment' || !part.mediaType.startsWith('image/')) return part
        const index = part.purpose === 'annotation' ? 0 : 1
        const image = images[index]
        return {
          ...part,
          previewUrl: image.type === 'file-attachment' ? image.previewUrl : undefined
        }
      })
      expect(splitAttachments(prepared.text)).toEqual({
        text,
        attachments: prepared.attachments.map(a => {
          if (!('data' in a)) return a
          const { data: _data, ...descriptor } = a
          return descriptor
        })
      })
      expect(prepared).not.toHaveProperty('images')
      expect(prepared.text).not.toContain('"data"')
      expect(prepared.parts.every(part => !('data' in part))).toBe(true)
      for (const [index, image] of nativeImages.entries()) {
        const ref = inputs[index === 0 ? 0 : 3]
        if (ref.type !== 'upload') throw new Error('expected upload')
        const upload = resolveUploads(workspaceId, [ref.uploadId])[0]
        if (!upload.data) throw new Error('expected image bytes')
        expect(image.data).toBe(upload.data)
        expect(image.mediaType).toBe(upload.mediaType)
        expect(image.purpose).toBe(ref.purpose)
        expect(image.source).toBe(ref.source)
      }
      expect(prepared.text).toContain('<moi-attachments>\n[')
      expect(prepared.text).not.toContain('"version"')
      expect(prepared.attachments.map(a => a.type)).toEqual(['image', 'text', 'file', 'image'])
      const cc = new ClaudeAdapter()
      const events = cc.ingest({
        type: 'user',
        uuid: 'test',
        message: { role: 'user', content: buildUserMessage(prepared).content }
      })
      const turn = events.find(e => e.kind === 'turn')
      expect(turn?.kind === 'turn' ? turn.turn.parts : null).toEqual(expected)
      expect(
        codexItemToTurn(
          {
            type: 'userMessage',
            id: 'test',
            content: [
              ...nativeImages.map(image => ({
                type: 'image' as const,
                url: `data:${image.mediaType};base64,${image.data.toString('base64')}`
              })),
              { type: 'text', text: prepared.text }
            ]
          },
          'session'
        )?.parts
      ).toEqual(expected)
      expect(replayedUserParts(prepared.text, images)).toEqual(expected)
    })
  }

  test('path delivery preserves drawing purpose and matches OpenClaw echoes', async () => {
    const workspaceId = 'path-attachments'
    const inputs = await mixedAttachments(workspaceId)
    await materializeAttachmentPaths(workspaceId, inputs)
    const prepared = prepareAttachmentMessage(workspaceId, '', inputs, false)
    expect(prepared.attachments.every(a => !('data' in a))).toBe(true)
    expect(prepared.attachments.map(a => a.type)).toEqual(['file', 'text', 'file', 'file'])
    for (const attachment of prepared.attachments) {
      if (attachment.type === 'file') {
        expect(attachment.path).toBeTruthy()
        expect(await Bun.file(attachment.path!).exists()).toBe(true)
        expect(attachment).not.toHaveProperty('label')
      }
    }
    const turn = messageToTurn({ role: 'user', content: prepared.text }, 'session', 0, new Map())!
    expect(turn.parts).toEqual(prepared.parts)
    expect(normalizeEchoText(prepared.text)).toBe(userEchoKey(turn.parts))
    const reversed = prepareAttachmentMessage(workspaceId, '', [...inputs].reverse(), false)
    expect(normalizeEchoText(prepared.text)).not.toBe(normalizeEchoText(reversed.text))
    const another = prepareAttachmentMessage(workspaceId, '', [inputs[3]], false)
    const first = prepareAttachmentMessage(workspaceId, '', [inputs[0]], false)
    expect(normalizeEchoText(first.text)).not.toBe(normalizeEchoText(another.text))
    const otherImage = inputs[3]
    if (otherImage.type !== 'upload') throw new Error('expected upload')
    const sameLabelAndMetadata = prepareAttachmentMessage(
      workspaceId,
      '',
      [{ ...otherImage, source: 'view:orders', purpose: 'annotation' }],
      false
    )
    expect(normalizeEchoText(first.text)).not.toBe(normalizeEchoText(sameLabelAndMetadata.text))
    expect(
      turn.parts.filter(p => p.type === 'file-attachment' && p.mediaType.startsWith('image/'))
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ previewUrl: undefined, path: expect.any(String) })
      ])
    )
    // Materializing paths must not change subsequent native-image delivery.
    const native = prepareAttachmentMessage(workspaceId, '', inputs)
    expect(native.attachments.filter(a => 'data' in a)).toHaveLength(2)
    expect(native.attachments.filter(a => a.type === 'image').every(a => !('path' in a))).toBe(true)
    expect(
      native.parts
        .filter(p => p.type === 'file-attachment')
        .filter(p => p.mediaType.startsWith('image/'))
        .map(p => p.path)
    ).toEqual([undefined, undefined])
  })

  test('Codex local images keep their filesystem path without becoming preview URLs', () => {
    const descriptor = { type: 'image' as const, label: 'Sketch.png', mediaType: 'image/png' }
    for (const content of [
      [],
      [{ type: 'text' as const, text: appendAttachments('', [descriptor]) }]
    ]) {
      const turn = codexItemToTurn(
        {
          type: 'userMessage',
          id: 'local-image',
          content: [{ type: 'localImage', path: '/tmp/sketch.png' }, ...content]
        },
        'session'
      )
      expect(turn?.parts).toHaveLength(1)
      const part = turn?.parts[0]
      expect(part?.type).toBe('file-attachment')
      if (part?.type !== 'file-attachment') throw new Error('expected attachment')
      expect(part.path).toBe('/tmp/sketch.png')
      expect(part.previewUrl).toBeUndefined()
      if (content.length) expect(part.label).toBe('Sketch.png')
    }
  })

  test('unclaimed native images survive replay and missing images keep their labels', () => {
    const native: Part = {
      type: 'file-attachment',
      mediaType: 'image/png',
      previewUrl: 'data:image/png;base64,eA=='
    }
    expect(replayAttachmentParts([native, { type: 'text', text: 'External image' }])).toEqual([
      native,
      { type: 'text', text: 'External image' }
    ])
    const text = appendAttachments('', [
      { type: 'image', label: 'Sketch.png', mediaType: 'image/png', purpose: 'sketch' }
    ])
    expect(replayAttachmentParts([{ type: 'text', text }])).toEqual([
      {
        type: 'file-attachment',
        label: 'Sketch.png',
        mediaType: 'image/png',
        purpose: 'sketch'
      }
    ])
  })

  test('missing, expired and foreign uploads reject the whole message', async () => {
    const inputs = await mixedAttachments('expiry')
    const first = inputs[0]
    if (first.type !== 'upload') throw new Error('expected upload')
    resolveUploads('expiry', [first.uploadId])[0].createdAt = 0
    expect(() =>
      prepareAttachmentMessage('expiry', 'Keep this text', [
        { type: 'upload', uploadId: 'missing' },
        ...inputs
      ])
    ).toThrow(AttachmentUploadError)
    expect(() => prepareAttachmentMessage('foreign', '', [first])).toThrow(
      'Attachment not found or expired'
    )
    await expect(materializeAttachmentPaths('foreign', [first])).rejects.toThrow(
      AttachmentUploadError
    )
  })

  test('legacy file notes and development text envelopes remain readable together', () => {
    const text = { source: 'view:orders', label: 'Order', text: 'Order #1042' }
    const raw = appendAttachmentNote(
      `Review\n<moi-attachments>${JSON.stringify({ version: 1, attachments: [text] })}</moi-attachments>`,
      [{ filename: 'report.txt', path: '/tmp/report.txt' }]
    )
    const expected: Part[] = [
      { type: 'text-attachment', source: text.source, label: text.label, text: text.text },
      {
        type: 'file-attachment',
        label: 'report.txt',
        mediaType: 'application/octet-stream',
        path: '/tmp/report.txt'
      },
      { type: 'text', text: 'Review' }
    ]
    expect(replayAttachmentParts([{ type: 'text', text: raw }])).toEqual(expected)
    expect(
      codexItemToTurn(
        { type: 'userMessage', id: 'test', content: [{ type: 'text', text: raw }] },
        'session'
      )?.parts
    ).toEqual(expected)
    expect(messageToTurn({ role: 'user', content: raw }, 'session', 0, new Map())?.parts).toEqual(
      expected
    )
  })

  test('invalid blocks stay visible and truncated attachment previews stay hidden', () => {
    for (const value of [
      [{ type: 'unknown' }],
      [{ type: 'file', mediaType: 'text/plain', path: 'relative.txt' }],
      [{ type: 'image', label: 'bad', mediaType: 'text/plain' }]
    ]) {
      const raw = `<moi-attachments>${JSON.stringify(value)}</moi-attachments>`
      expect(replayAttachmentParts([{ type: 'text', text: raw }])).toEqual([
        { type: 'text', text: raw }
      ])
    }
    const raw = appendAttachments('Review', [
      { type: 'image', label: '</moi-attachments>', mediaType: 'image/png' }
    ])
    expect(raw.match(/<\/moi-attachments>/g)).toHaveLength(1)
    expect(formatChatTitle(raw.slice(0, -10))).toBe('Review')
  })
})
