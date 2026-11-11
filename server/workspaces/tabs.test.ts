import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as remoteClient from '../remote/client'
import { api } from '../api'
import * as workspaceViews from '../applets/views'

import { afterEach, describe, expect, spyOn, test } from 'bun:test'

import type { ViewInfo } from '@/lib/types'

import { assembleTabRows, assertNavigableTab, getWorkspaceTabs } from './tabs'
import { DEFAULT_REGISTRY_PATH, registerWorkspace, setRegistryPath } from './registry'

const views: ViewInfo[] = [
  { id: 'roadmap', status: 'compiled', title: 'Roadmap' },
  { id: 'orders', status: 'compiled', title: '' }
]

describe('assembleTabRows', () => {
  test('lists static tabs then views, marking the saved default', () => {
    const rows = assembleTabRows(views, 'views/roadmap')
    expect(rows.map(r => r.id)).toEqual(['overview', 'scratchpad', 'views/roadmap', 'views/orders'])
    expect(rows.find(r => r.isDefault)?.id).toBe('views/roadmap')
  })

  test('falls back to the view id when the title is empty', () => {
    const rows = assembleTabRows(views, 'overview')
    expect(rows.find(r => r.id === 'views/orders')?.title).toBe('orders')
    expect(rows.find(r => r.id === 'views/roadmap')?.title).toBe('Roadmap')
  })

  test('pending views are ordinary navigable rows', () => {
    const pending: ViewInfo = {
      id: 'draft',
      status: 'draft',
      title: 'Draft view',
      requirements: ''
    }
    const rows = assembleTabRows([...views, pending], 'views/draft')
    expect(rows.find(row => row.id === 'views/draft')).toMatchObject({
      title: 'Draft view',
      isDefault: true,
      href: 'moi:/views/draft'
    })
  })
})

test('every discovered tab has a portable address', () => {
  const rows = assembleTabRows(views, 'overview')
  expect(rows.find(row => row.id === 'views/orders')?.href).toBe('moi:/views/orders')
  expect(rows.map(row => row.href)).toEqual([
    'moi:/overview',
    'moi:/scratchpad',
    'moi:/views/roadmap',
    'moi:/views/orders'
  ])
})

describe('assertNavigableTab', () => {
  test('accepts built-in destinations and built views', () => {
    expect(() => assertNavigableTab('overview', assembleTabRows(views, 'overview'))).not.toThrow()
    expect(() => assertNavigableTab('scratchpad', assembleTabRows(views, 'overview'))).not.toThrow()
    expect(() =>
      assertNavigableTab('views/orders', assembleTabRows(views, 'overview'))
    ).not.toThrow()
  })

  test('lists the current addresses when a view is missing', () => {
    expect(() => assertNavigableTab('views/order', assembleTabRows(views, 'overview'))).toThrow(
      'Unknown destination "moi:/views/order". Valid addresses: moi:/overview, moi:/scratchpad, moi:/views/roadmap, moi:/views/orders'
    )
  })
})

const directories: string[] = []
const spies: { mockRestore(): void }[] = []
afterEach(async () => {
  for (const spy of spies.splice(0)) spy.mockRestore()
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function workspaceFixture(config: unknown) {
  const path = await mkdtemp(join(tmpdir(), 'moi-tabs-'))
  directories.push(path)
  await mkdir(join(path, '.moi'))
  await Bun.write(join(path, '.moi/.workspace.json'), JSON.stringify(config))
  setRegistryPath(join(path, 'registry.json'))
  return registerWorkspace(path, { id: 'board' })
}

function mockOwner(status = 200) {
  spies.push(
    spyOn(remoteClient, 'remoteConfig').mockResolvedValue({
      url: 'http://localhost:8787/cloud',
      clientId: 'moi-cli',
      managed: false
    })
  )
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async () =>
        status === 200 ? Response.json({ views }) : new Response('Unavailable', { status }),
      { preconnect: fetch.preconnect }
    )
  )
  spies.push(fetchSpy)
  return fetchSpy
}

test('remote discovery uses owner views and the visitor saved default', async () => {
  const workspace = await workspaceFixture({
    version: 2,
    remote: { user_id: 'alice', workspace_id: 'owner-board' },
    tabs: { open: ['overview', 'views/orders'], active: 'views/orders' }
  })
  const fetchSpy = mockOwner()
  const rows = await getWorkspaceTabs(workspace)
  expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
    'http://localhost:8787/api/remote/alice/workspaces/owner-board/views?includePending=true'
  )
  expect(rows.map(row => row.id)).toEqual([
    'overview',
    'scratchpad',
    'views/roadmap',
    'views/orders'
  ])
  expect(rows.find(row => row.isDefault)?.id).toBe('views/orders')
  expect(() => assertNavigableTab('views/roadmap', rows)).not.toThrow()
  expect(() => assertNavigableTab('views/visitor-only', rows)).toThrow('Unknown destination')
})

test('remote discovery defaults to Overview when the visitor has no saved tabs', async () => {
  const workspace = await workspaceFixture({
    version: 2,
    remote: { user_id: 'alice', workspace_id: 'board' }
  })
  mockOwner()
  expect((await getWorkspaceTabs(workspace)).find(row => row.isDefault)?.id).toBe('overview')
})

test('remote discovery reports owner failure without reading visitor views', async () => {
  const workspace = await workspaceFixture({
    version: 2,
    remote: { user_id: 'alice', workspace_id: 'board' }
  })
  mockOwner(503)
  const local = spyOn(workspaceViews, 'getWorkspaceViews')
  spies.push(local)
  await expect(getWorkspaceTabs(workspace)).rejects.toThrow('Workspace request failed (503)')
  expect(local).not.toHaveBeenCalled()
})

test('local discovery keeps using compiled and pending local views', async () => {
  const workspace = await workspaceFixture({
    version: 2,
    tabs: { open: ['overview', 'views/roadmap'], active: 'views/roadmap' }
  })
  const local = spyOn(api, 'fetch').mockImplementation(async request => {
    expect(new URL(request.url).pathname).toBe('/api/workspaces/board/views')
    expect(new URL(request.url).searchParams.get('includePending')).toBe('true')
    return Response.json({ views })
  })
  spies.push(local)
  expect((await getWorkspaceTabs(workspace)).find(row => row.isDefault)?.id).toBe('views/roadmap')
  expect(local).toHaveBeenCalledTimes(1)
})
