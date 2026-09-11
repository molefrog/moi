import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import type { WorkspaceEntry } from '@/lib/types'

import { api } from './api'
import { setEventServer } from './events'
import { loadLayout } from './layout'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

let tempDir: string
let workspaceDir: string
let workspaceId: string
let published: string[]

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-api-workspace-presentation-'))
  workspaceDir = join(tempDir, 'workspace')
  await mkdir(join(workspaceDir, '.moi'), { recursive: true })
  setRegistryPath(join(tempDir, 'workspaces.json'))
  workspaceId = (await registerWorkspace(workspaceDir, { type: 'codex' })).id
  published = []
  setEventServer({
    publish: (_topic, data) => {
      published.push(data)
    }
  })
})

afterEach(async () => {
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await rm(tempDir, { recursive: true, force: true })
})

async function putIcon() {
  return api.request(`/api/workspaces/${workspaceId}/icon`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: PNG
  })
}

async function putConfig(body: Record<string, unknown>) {
  return api.request(`/api/workspaces/${workspaceId}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

test('glyphs and uploads keep their complete presentation in one icon object', async () => {
  const glyph = { type: 'glyph', value: 'rocket', background: 'theme' }
  expect((await putConfig({ icon: glyph })).status).toBe(200)
  expect(await loadLayout(workspaceDir)).toMatchObject({
    icon: glyph
  })

  const list = (await (await api.request('/api/workspaces')).json()) as WorkspaceEntry[]
  expect(list[0]).toMatchObject({ icon: glyph })

  expect((await putIcon()).status).toBe(200)
  const plain = await loadLayout(workspaceDir)
  expect(plain.icon?.type).toBe('upload')
  if (plain.icon?.type !== 'upload') throw new Error('Expected an uploaded icon')
  expect(plain.icon.value).toStartWith('data:image/webp;base64,')
  expect('background' in plain.icon).toBe(false)
})

test('emoji Unicode and background metadata are stored together', async () => {
  expect((await putConfig({ icon: { type: 'emoji', value: '💡' } })).status).toBe(200)
  const original = await loadLayout(workspaceDir)
  expect(original.icon).toEqual({ type: 'emoji', value: '💡' })

  const addBackground = await putConfig({
    icon: { type: 'emoji', value: '💡', background: 'theme' }
  })
  const themed = await loadLayout(workspaceDir)
  expect(addBackground.status).toBe(200)
  expect(themed.icon).toEqual({ type: 'emoji', value: '💡', background: 'theme' })

  const removeBackground = await putConfig({ icon: { type: 'emoji', value: '💡' } })
  const plain = await loadLayout(workspaceDir)
  expect(removeBackground.status).toBe(200)
  expect(plain.icon).toEqual(original.icon)
})

test('resetting an icon clears the complete object', async () => {
  await putConfig({ icon: { type: 'glyph', value: 'rocket', background: 'theme' } })

  const response = await api.request(`/api/workspaces/${workspaceId}/icon`, {
    method: 'DELETE'
  })
  const layout = await loadLayout(workspaceDir)

  expect(response.status).toBe(204)
  expect('icon' in layout).toBe(false)
})

test('workspace config rejects unknown glyph ids', async () => {
  const response = await putConfig({ icon: { type: 'glyph', value: 'missing' } })

  expect(response.status).toBe(400)
  expect('icon' in (await loadLayout(workspaceDir))).toBe(false)
})

test('theme saves broadcast changes and expose the theme in workspace lists', async () => {
  const layout = await loadLayout(workspaceDir)
  const theme = { font: 'sans', color: 'rose', radius: 'soft', agent: 'boxy' } as const

  const response = await api.request(`/api/workspaces/${workspaceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...layout, theme })
  })
  const list = (await (await api.request('/api/workspaces')).json()) as WorkspaceEntry[]

  expect(response.status).toBe(204)
  expect(published).toContain(JSON.stringify({ type: 'theme:updated' }))
  expect(list[0]?.theme).toEqual(theme)
})
