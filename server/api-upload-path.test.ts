import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, symlink, truncate } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { api } from './api'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'
import { getUpload, MAX_UPLOAD_BYTES } from './uploads'
import type { UploadInfo } from '@/lib/types'

let temp: string
let root: string
let workspaceId: string
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'moi-path-upload-'))
  root = join(temp, 'workspace')
  await mkdir(root)
  setRegistryPath(join(temp, 'registry.json'))
  workspaceId = (await registerWorkspace(root, { type: 'codex' })).id
})
afterEach(async () => {
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(temp, { recursive: true, force: true })
})
function attach(path: unknown) {
  return api.request(`/api/workspaces/${workspaceId}/uploads/from-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  })
}

test('snapshots text, JSON and PDFs using the existing upload store', async () => {
  for (const name of ['notes.txt', 'data.json', 'report.pdf']) {
    await Bun.write(join(root, name), 'original bytes')
    const response = await attach(name)
    expect(response.status).toBe(200)
    const info = (await response.json()) as UploadInfo
    expect(info.filename).toBe(name)
    expect(info.kind).toBe('file')
    expect(info.mediaType).not.toBe('application/octet-stream')
    await Bun.write(join(root, name), 'changed')
    await rm(join(root, name))
    const stored = getUpload(workspaceId, info.id)!
    expect(await Bun.file(stored.path!).text()).toBe('original bytes')
    expect(getUpload('another-workspace', info.id)).toBeNull()
  }
})

test('processes workspace images and allows internal visible symlinks', async () => {
  await Bun.write(
    join(root, 'image.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
  )
  await symlink(join(root, 'image.png'), join(root, 'alias.png'))
  const response = await attach('alias.png')
  expect(response.status).toBe(200)
  const info = (await response.json()) as UploadInfo
  expect(info).toMatchObject({ kind: 'image', mediaType: 'image/png', width: 1, height: 1 })
  expect(getUpload(workspaceId, info.id)?.data).toBeDefined()
})

test('rejects unsafe paths, missing files, directories, symlink escapes and hidden targets', async () => {
  await Bun.write(join(temp, 'outside.txt'), 'outside')
  await Bun.write(join(root, '.secret'), 'hidden')
  await mkdir(join(root, 'folder'))
  await symlink(join(temp, 'outside.txt'), join(root, 'escape.txt'))
  await symlink(join(root, '.secret'), join(root, 'hidden.txt'))
  for (const path of [
    null,
    5,
    '',
    '/etc/passwd',
    'C:\\file.txt',
    '../outside.txt',
    'folder/../x',
    '.secret',
    '.moi/data.json',
    'a/.hidden/b',
    'a\0b',
    'missing.txt',
    'folder',
    'escape.txt',
    'hidden.txt'
  ]) {
    expect((await attach(path)).status).toBe(400)
  }
})

test('rejects oversized files before reading their bytes and invalid images during processing', async () => {
  const path = join(root, 'large.bin')
  await Bun.write(path, '')
  await truncate(path, MAX_UPLOAD_BYTES + 1)
  expect(await (await attach('large.bin')).text()).toContain('max 32 MB')
  await Bun.write(join(root, 'bad.png'), 'not an image')
  expect((await attach('bad.png')).status).toBe(400)
})
