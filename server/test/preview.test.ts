import { describe, expect, test } from 'bun:test'
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

import { readImageRelPath } from '@/client/features/chat/tool-group/ReadImagePreview'
import type { ToolCall } from '@/lib/types'

import { serveWorkspaceImagePreview } from '../preview'

async function makeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'moi-preview-'))
  await sharp({
    create: { width: 2400, height: 1600, channels: 3, background: { r: 200, g: 40, b: 40 } }
  })
    .png()
    .toFile(join(root, 'big.png'))
  writeFileSync(join(root, 'vector.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  writeFileSync(join(root, 'notes.txt'), 'text')
  writeFileSync(join(root, 'broken.png'), 'not a png at all')
  return root
}

describe('serveWorkspaceImagePreview', () => {
  test('downscales a large image to the preview edge as webp', async () => {
    const root = await makeWorkspace()
    const res = await serveWorkspaceImagePreview(root, 'big.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(res.headers.get('ETag')).toBeTruthy()
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
    expect(meta.width).toBe(800)
    expect(meta.height).toBe(533)
  })

  test('revalidates: matching If-None-Match → 304', async () => {
    const root = await makeWorkspace()
    const first = await serveWorkspaceImagePreview(root, 'big.png')
    const etag = first.headers.get('ETag')!
    const second = await serveWorkspaceImagePreview(root, 'big.png', etag)
    expect(second.status).toBe(304)
  })

  test('streams svg through untouched', async () => {
    const root = await makeWorkspace()
    const res = await serveWorkspaceImagePreview(root, 'vector.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('svg')
    expect(await res.text()).toContain('<svg')
  })

  test('rejects non-image extensions', async () => {
    const root = await makeWorkspace()
    expect((await serveWorkspaceImagePreview(root, 'notes.txt')).status).toBe(415)
  })

  test('undecodable image → 415, not a crash', async () => {
    const root = await makeWorkspace()
    expect((await serveWorkspaceImagePreview(root, 'broken.png')).status).toBe(415)
  })

  test('missing file → 404', async () => {
    const root = await makeWorkspace()
    expect((await serveWorkspaceImagePreview(root, 'nope.png')).status).toBe(404)
  })

  test('blocks traversal and symlink escape (shared /fs/ guards)', async () => {
    const root = await makeWorkspace()
    expect((await serveWorkspaceImagePreview(root, '../escape.png')).status).toBe(403)
    // A symlink inside the root pointing outside it must not serve.
    const outside = mkdtempSync(join(tmpdir(), 'moi-outside-'))
    await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } }
    })
      .png()
      .toFile(join(outside, 'secret.png'))
    symlinkSync(join(outside, 'secret.png'), join(root, 'link.png'))
    expect((await serveWorkspaceImagePreview(root, 'link.png')).status).toBe(403)
  })
})

describe('readImageRelPath', () => {
  const call = (name: string, file_path?: string): ToolCall => ({
    toolCallId: 't1',
    name,
    caller: 'agent',
    provider: 'claude-code',
    state: 'success',
    input: file_path === undefined ? {} : { file_path }
  })

  test('relativizes a workspace image read', () => {
    expect(readImageRelPath(call('Read', '/ws/shots/a.png'), '/ws')).toBe('shots/a.png')
    expect(readImageRelPath(call('Read', '/ws/a.jpeg'), '/ws/')).toBe('a.jpeg')
  })

  test('ignores non-Read, non-image, and outside-workspace paths', () => {
    expect(readImageRelPath(call('Write', '/ws/a.png'), '/ws')).toBeNull()
    expect(readImageRelPath(call('Read', '/ws/a.md'), '/ws')).toBeNull()
    expect(readImageRelPath(call('Read', '/tmp/a.png'), '/ws')).toBeNull()
    expect(readImageRelPath(call('Read', '/ws/a.png'), null)).toBeNull()
    expect(readImageRelPath(call('Read'), '/ws')).toBeNull()
  })
})
