import { describe, expect, test } from 'bun:test'
import sharp from 'sharp'

import { ClaudeAdapter } from '@/lib/claude-adapter'
import type { Part } from '@/lib/format'

import { buildUserMessage } from '../cc-session'
import {
  addUpload,
  materializeToPath,
  resolveUploads,
  uploadDataUrl,
  uploadToDisplayPart
} from '../uploads'

// Helpers ------------------------------------------------------------------

async function pngBuffer(w: number, h: number) {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 30 } }
  })
    .png()
    .toBuffer()
}

async function addImage(workspaceId: string, name = 'shot.png') {
  const bytes = await pngBuffer(3000, 2000)
  const info = await addUpload({ workspaceId, filename: name, mediaType: 'image/png', bytes })
  return resolveUploads(workspaceId, [info.id])[0]
}

function fileParts(parts: Part[]) {
  return parts.filter((p): p is Extract<Part, { type: 'file' }> => p.type === 'file')
}
function textPart(parts: Part[]) {
  return parts.find((p): p is Extract<Part, { type: 'text' }> => p.type === 'text')
}

type Block = {
  type: string
  text?: string
  source?: { type?: string; media_type?: string; data?: string }
}
function asBlocks(content: string | unknown[]): Block[] {
  if (typeof content === 'string') throw new Error('expected content blocks, got a string')
  return content as Block[]
}

// uploads.ts ---------------------------------------------------------------

describe('uploads: image processing', () => {
  test('downscales to <=1568px long edge, keeps format + dims', async () => {
    const info = await addUpload({
      workspaceId: 'ws',
      filename: 'big.png',
      mediaType: 'image/png',
      bytes: await pngBuffer(3000, 2000)
    })
    expect(info.kind).toBe('image')
    expect(info.mediaType).toBe('image/png')
    expect(info.width).toBe(1568)
    expect(info.height).toBe(1045)
  })

  test('does not upscale a small image', async () => {
    const info = await addUpload({
      workspaceId: 'ws',
      filename: 'small.png',
      mediaType: 'image/png',
      bytes: await pngBuffer(100, 80)
    })
    expect(info.width).toBe(100)
    expect(info.height).toBe(80)
  })

  test('transcodes a non-vision image type to PNG', async () => {
    // Feed webp bytes but label as bmp — uploads should transcode to png.
    const webp = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 1, g: 2, b: 3 } }
    })
      .webp()
      .toBuffer()
    const info = await addUpload({
      workspaceId: 'ws',
      filename: 'x.bmp',
      mediaType: 'image/bmp',
      bytes: webp
    })
    expect(info.kind).toBe('image')
    expect(info.mediaType).toBe('image/png')
  })

  test('passes a GIF through unchanged (no transcode)', async () => {
    const gifBytes = Buffer.from('GIF89a-not-a-real-gif')
    const info = await addUpload({
      workspaceId: 'ws',
      filename: 'a.gif',
      mediaType: 'image/gif',
      bytes: gifBytes
    })
    expect(info.kind).toBe('image')
    expect(info.mediaType).toBe('image/gif')
    const [u] = resolveUploads('ws', [info.id])
    expect(u.data?.equals(gifBytes)).toBe(true)
  })

  test('keeps a vision-safe JPEG as JPEG', async () => {
    const jpeg = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 5, g: 6, b: 7 } }
    })
      .jpeg()
      .toBuffer()
    const info = await addUpload({
      workspaceId: 'ws',
      filename: 'p.jpg',
      mediaType: 'image/jpeg',
      bytes: jpeg
    })
    expect(info.mediaType).toBe('image/jpeg')
  })
})

describe('uploads: non-image files', () => {
  test('writes bytes to a temp path readable by the agent', async () => {
    const info = await addUpload({
      workspaceId: 'ws',
      filename: 'notes.txt',
      mediaType: 'text/plain',
      bytes: Buffer.from('hello world')
    })
    expect(info.kind).toBe('file')
    const [u] = resolveUploads('ws', [info.id])
    expect(u.path).toBeTruthy()
    expect(await Bun.file(u.path!).text()).toBe('hello world')
  })

  test('defaults a missing media type to octet-stream', async () => {
    const info = await addUpload({
      workspaceId: 'ws',
      filename: 'blob.bin',
      mediaType: '',
      bytes: Buffer.from([1, 2, 3])
    })
    expect(info.mediaType).toBe('application/octet-stream')
  })

  test('sanitizes path-traversal filenames', async () => {
    const info = await addUpload({
      workspaceId: 'ws',
      filename: '../../etc/passwd',
      mediaType: 'text/plain',
      bytes: Buffer.from('x')
    })
    expect(info.filename).not.toContain('/')
    expect(info.filename).not.toContain('..')
  })
})

describe('uploads: resolve + display helpers', () => {
  test('resolveUploads preserves order and drops unknown ids', async () => {
    const a = await addUpload({
      workspaceId: 'wsx',
      filename: 'a.txt',
      mediaType: 'text/plain',
      bytes: Buffer.from('a')
    })
    const b = await addUpload({
      workspaceId: 'wsx',
      filename: 'b.txt',
      mediaType: 'text/plain',
      bytes: Buffer.from('b')
    })
    const out = resolveUploads('wsx', [b.id, 'nope', a.id])
    expect(out.map(u => u.filename)).toEqual(['b.txt', 'a.txt'])
  })

  test('resolveUploads is scoped to its workspace', async () => {
    const info = await addUpload({
      workspaceId: 'owner',
      filename: 'a.txt',
      mediaType: 'text/plain',
      bytes: Buffer.from('a')
    })
    expect(resolveUploads('intruder', [info.id])).toHaveLength(0)
    expect(resolveUploads('owner', [info.id])).toHaveLength(1)
  })

  test('uploadDataUrl returns a data URL for images, null for files', async () => {
    const img = await addImage('wsd')
    expect(uploadDataUrl(img)?.startsWith('data:image/png;base64,')).toBe(true)
    const fileInfo = await addUpload({
      workspaceId: 'wsd',
      filename: 'f.txt',
      mediaType: 'text/plain',
      bytes: Buffer.from('x')
    })
    const [file] = resolveUploads('wsd', [fileInfo.id])
    expect(uploadDataUrl(file)).toBeNull()
  })

  test('uploadToDisplayPart: image → data URL, file → path chip', async () => {
    const img = await addImage('wsp')
    const imgPart = uploadToDisplayPart(img)
    expect(imgPart?.type).toBe('file')
    if (imgPart?.type === 'file') {
      expect(imgPart.mediaType).toBe('image/png')
      expect(imgPart.url.startsWith('data:image/png;base64,')).toBe(true)
    }

    const fileInfo = await addUpload({
      workspaceId: 'wsp',
      filename: 'doc.txt',
      mediaType: 'text/plain',
      bytes: Buffer.from('x')
    })
    const [file] = resolveUploads('wsp', [fileInfo.id])
    const filePart = uploadToDisplayPart(file)
    if (filePart?.type === 'file') {
      expect(filePart.filename).toBe('doc.txt')
      expect(filePart.url).toBe(file.path)
    }
  })

  test('materializeToPath writes image bytes and is idempotent', async () => {
    const img = await addImage('wsm')
    const p1 = await materializeToPath(img)
    expect(p1).toBeTruthy()
    expect((await Bun.file(p1!).arrayBuffer()).byteLength).toBe(img.data!.byteLength)
    const p2 = await materializeToPath(img)
    expect(p2).toBe(p1) // reuses the existing path
  })
})

// cc-session: buildUserMessage --------------------------------------------

describe('buildUserMessage', () => {
  test('no attachments → plain string content', () => {
    const { content, parts } = buildUserMessage('hi there', [])
    expect(content).toBe('hi there')
    expect(parts).toHaveLength(1)
    expect(textPart(parts)?.text).toBe('hi there')
  })

  test('image attachment → base64 image block + trailing text block', async () => {
    const img = await addImage('wsb')
    const { content, parts } = buildUserMessage('describe', [img])
    const blocks = asBlocks(content as unknown[])
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe('image')
    expect(blocks[0].source?.type).toBe('base64')
    expect(blocks[0].source?.media_type).toBe('image/png')
    expect(blocks[0].source?.data).toBe(img.data!.toString('base64'))
    expect(blocks[1].type).toBe('text')
    expect(blocks[1].text).toBe('describe')

    // Display parts: attachment first, then text.
    expect(parts[0].type).toBe('file')
    expect(parts[1].type).toBe('text')
  })

  test('image-only message still ends with a text block', async () => {
    const img = await addImage('wsb2')
    const { content, parts } = buildUserMessage('', [img])
    const blocks = asBlocks(content as unknown[])
    expect(blocks[0].type).toBe('image')
    expect(blocks.at(-1)?.type).toBe('text')
    expect(blocks.at(-1)?.text).toBe('(see attached files)')
    // No empty text display part for an image-only turn.
    expect(textPart(parts)).toBeUndefined()
    expect(fileParts(parts)).toHaveLength(1)
  })

  test('non-image file → path note appended to the agent text only', async () => {
    const info = await addUpload({
      workspaceId: 'wsf',
      filename: 'report.csv',
      mediaType: 'text/csv',
      bytes: Buffer.from('a,b\n1,2')
    })
    const [u] = resolveUploads('wsf', [info.id])
    const { content, parts } = buildUserMessage('summarize this', [u])
    const blocks = asBlocks(content as unknown[])
    // Only a text block (no image), carrying the path note.
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('text')
    expect(blocks[0].text).toContain('summarize this')
    expect(blocks[0].text).toContain('report.csv')
    expect(blocks[0].text).toContain(u.path!)
    // Display text stays the user's text (no path note leaking into the bubble).
    expect(textPart(parts)?.text).toBe('summarize this')
    expect(fileParts(parts)).toHaveLength(1)
  })

  test('mixed image + file → image block then path-note text block', async () => {
    const img = await addImage('wsmix')
    const fInfo = await addUpload({
      workspaceId: 'wsmix',
      filename: 'data.json',
      mediaType: 'application/json',
      bytes: Buffer.from('{}')
    })
    const [file] = resolveUploads('wsmix', [fInfo.id])
    const { content } = buildUserMessage('look', [img, file])
    const blocks = asBlocks(content as unknown[])
    expect(blocks[0].type).toBe('image')
    expect(blocks.at(-1)?.type).toBe('text')
    expect(blocks.at(-1)?.text).toContain('data.json')
  })
})

// Round-trip: build → persist shape → adapter replay ----------------------

describe('persist/reload round-trip', () => {
  test('image block built for the agent re-parses into a file part', async () => {
    const img = await addImage('wsr')
    const { content } = buildUserMessage('hi', [img])
    // Simulate what the SDK persists to the session .jsonl: a user message whose
    // content is exactly the blocks we sent.
    const adapter = new ClaudeAdapter()
    const events = adapter.ingest({ type: 'user', uuid: 'r1', message: { role: 'user', content } })
    const turn = events.find(e => e.kind === 'turn')
    if (turn?.kind !== 'turn') throw new Error('expected a turn')
    const file = fileParts(turn.turn.parts)[0]
    expect(file.mediaType).toBe('image/png')
    expect(file.url).toBe(`data:image/png;base64,${img.data!.toString('base64')}`)
  })

  test('persisted base64 document (PDF) block → file part', () => {
    const adapter = new ClaudeAdapter()
    const events = adapter.ingest({
      type: 'user',
      uuid: 'r2',
      message: {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: 'JVBER' },
            filename: 'spec.pdf'
          }
        ]
      }
    })
    const turn = events.find(e => e.kind === 'turn')
    if (turn?.kind !== 'turn') throw new Error('expected a turn')
    const file = fileParts(turn.turn.parts)[0]
    expect(file.mediaType).toBe('application/pdf')
    expect(file.url).toBe('data:application/pdf;base64,JVBER')
    expect(file.filename).toBe('spec.pdf')
  })

  test('bare-url image block is passed through unchanged', () => {
    const adapter = new ClaudeAdapter()
    const events = adapter.ingest({
      type: 'user',
      uuid: 'r3',
      message: {
        role: 'user',
        content: [{ type: 'image', media_type: 'image/jpeg', url: 'https://x/y.jpg' }]
      }
    })
    const turn = events.find(e => e.kind === 'turn')
    if (turn?.kind !== 'turn') throw new Error('expected a turn')
    expect(fileParts(turn.turn.parts)[0].url).toBe('https://x/y.jpg')
  })
})
