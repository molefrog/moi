import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { stringify } from 'devalue'

import type { ViewInfo } from '@/lib/types'

import { api } from './api'
import { DATA_DIR } from './data-dir'
import { setEventServer } from './events'
import { loadLayout, saveLayout } from './layout'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'
import { listViewBuilders, setBuilder, setViewBuilderStorePath } from './view-builders'
import { buildAllViews, updateViewTitle } from './views'
import { silenceConsole } from './test/quiet'

silenceConsole('log')
silenceConsole('error')

let tempDir: string
let workspaceDir: string
let workspaceId: string
let sourcePath: string
let serverPath: string
let sharedPath: string
let dataPath: string
let published: unknown[]

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'moi-api-views-'))
  workspaceDir = join(tempDir, 'workspace')
  const viewsDir = join(workspaceDir, '.moi', 'views')
  const dataDir = join(workspaceDir, '.moi', 'data')
  sourcePath = join(viewsDir, 'cards.tsx')
  serverPath = join(viewsDir, 'cards.server.ts')
  sharedPath = join(viewsDir, '_shared.ts')
  dataPath = join(dataDir, 'cards.sqlite')

  await mkdir(viewsDir, { recursive: true })
  await mkdir(dataDir, { recursive: true })
  await symlink(
    join(import.meta.dir, '..', 'node_modules'),
    join(workspaceDir, '.moi', 'node_modules')
  )
  await Promise.all([
    writeFile(
      sourcePath,
      "export const config = { title: 'Cards' }\nexport default function Cards() { return <div>Cards</div> }\n"
    ),
    writeFile(serverPath, 'export async function load() { return true }\n'),
    writeFile(sharedPath, 'export const shared = true\n'),
    writeFile(dataPath, '')
  ])

  setRegistryPath(join(tempDir, 'workspaces.json'))
  setViewBuilderStorePath(join(tempDir, 'view-builders.json'))
  workspaceId = (await registerWorkspace(workspaceDir, { type: 'codex' })).id
  published = []
  setEventServer({ publish: (_topic, data) => published.push(JSON.parse(data)) })
  await buildAllViews(workspaceDir)
  await setBuilder(workspaceId, workspaceDir, 'cards', {
    kind: 'view',
    status: 'building',
    title: 'Cards'
  })
  published = []
})

afterEach(async () => {
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  setViewBuilderStorePath(join(DATA_DIR, 'view-builders.json'))
  await rm(tempDir, { recursive: true, force: true })
})

test('renames a view through its source-backed config', async () => {
  const response = await api.request(`/api/workspaces/${workspaceId}/views/cards`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Study cards' })
  })
  const view = (await response.json()) as ViewInfo

  expect(response.status).toBe(200)
  expect(view).toMatchObject({ id: 'cards', config: { title: 'Study cards' } })
  expect(await Bun.file(sourcePath).text()).toContain('title: "Study cards"')
  expect(published).toContainEqual(expect.objectContaining({ type: 'view-layout:updated' }))
})

test('restores the source when the renamed view does not build', async () => {
  const broken =
    "import missing from './missing'\nexport const config = { title: 'Cards' }\nexport default function Cards() { return missing }\n"
  await writeFile(sourcePath, broken)

  await expect(
    updateViewTitle(() => {}, workspaceId, workspaceDir, 'cards', 'Study cards')
  ).rejects.toMatchObject({ status: 422 })
  expect(await Bun.file(sourcePath).text()).toBe(broken)
})

test('deletes a view and its owned state while preserving shared files and data', async () => {
  await saveLayout(
    {
      ...(await loadLayout(workspaceDir)),
      tabs: { open: ['overview', 'view:cards'], active: 'view:cards' }
    },
    workspaceDir
  )
  const rpcBeforeDelete = await api.request(`/api/workspaces/${workspaceId}/rpc/views/cards/load`, {
    method: 'POST',
    body: stringify([])
  })
  expect(rpcBeforeDelete.status).toBe(200)

  const response = await api.request(`/api/workspaces/${workspaceId}/views/cards`, {
    method: 'DELETE'
  })

  expect(response.status).toBe(204)
  expect(await Bun.file(sourcePath).exists()).toBe(false)
  expect(await Bun.file(serverPath).exists()).toBe(false)
  expect(await Bun.file(sharedPath).exists()).toBe(true)
  expect(await Bun.file(dataPath).exists()).toBe(true)
  expect(await listViewBuilders(workspaceDir)).toEqual([])
  expect((await loadLayout(workspaceDir)).tabs).toEqual({
    open: ['overview'],
    active: 'overview'
  })
  expect(await (await api.request(`/api/workspaces/${workspaceId}/views`)).json()).toEqual({
    views: []
  })
  const rpcAfterDelete = await api.request(`/api/workspaces/${workspaceId}/rpc/views/cards/load`, {
    method: 'POST',
    body: stringify([])
  })
  expect(rpcAfterDelete.status).toBe(500)
  expect(published).toContainEqual({ type: 'view:deleted', workspaceId, name: 'cards' })
})
