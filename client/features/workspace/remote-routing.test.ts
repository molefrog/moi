import { workspaceIdentity } from '@/lib/workspace-identity'
import { afterEach, expect, spyOn, test } from 'bun:test'
import { loadWorkspaceLayout, saveWorkspaceLayout } from './api'
import { workspaceBase } from '@/lib/workspace-identity'
import { appletKey, appletUrl, appletStyleKey } from '@/client/features/applets/applet-cache'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'

const visitor = workspaceIdentity({
  id: 'board',
  remote: { user_id: 'alice', workspace_id: 'board' }
})
const other = workspaceIdentity({ id: 'board', remote: { user_id: 'bob', workspace_id: 'board' } })

const spies: ReturnType<typeof spyOn>[] = []
function mockFetch(
  implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
) {
  return spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(implementation, { preconnect: fetch.preconnect })
  )
}
afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore()
})
test('bootstraps locally, loads owner content, and keeps personal defaults local', async () => {
  const requests: string[] = []
  spies.push(
    mockFetch(async input => {
      const url = String(input)
      requests.push(url)
      return Response.json(
        url === `/api/workspaces/${visitor}`
          ? {
              version: 2,
              remote: { user_id: 'alice', workspace_id: 'board' },
              cwd: '/visitor',
              layoutMode: 'split'
            }
          : {
              ...createDefaultWorkspaceLayout(),
              cwd: '/owner',
              name: 'Owner board',
              selectedModel: 'owner-model',
              layoutMode: 'fullscreen',
              tabs: { open: ['overview', 'views/owner'], active: 'views/owner' }
            }
      )
    })
  )
  const layout = await loadWorkspaceLayout(visitor)
  expect(requests).toEqual([`/api/workspaces/${visitor}`, '/api/remote/alice/workspaces/board'])
  expect(layout).toMatchObject({ cwd: '/visitor', name: 'Owner board', layoutMode: 'split' })
  expect(layout.selectedModel).toBeUndefined()
  expect(layout.tabs).toEqual({ open: ['overview'], active: 'overview' })
})
test('remote failure never falls back to local content', async () => {
  const requests: string[] = []
  spies.push(
    mockFetch(async input => {
      requests.push(String(input))
      return requests.length === 1
        ? Response.json({ version: 2, remote: { user_id: 'alice', workspace_id: 'board' } })
        : new Response('Owner unavailable', { status: 503 })
    })
  )
  await expect(loadWorkspaceLayout(visitor)).rejects.toThrow('Owner unavailable')
  expect(requests).toHaveLength(2)
})
test('saves visitor preferences separately from shared layout', async () => {
  const writes: { url: string; body: Record<string, unknown> }[] = []
  spies.push(
    mockFetch(async (input, init) => {
      writes.push({ url: String(input), body: JSON.parse(String(init?.body)) })
      return new Response(null, { status: 204 })
    })
  )
  await saveWorkspaceLayout(visitor, {
    ...createDefaultWorkspaceLayout(),
    selectedModel: 'sonnet',
    tabs: { open: ['overview', 'views/second', 'views/first'], active: 'views/first' }
  })
  expect(writes[0]).toEqual({
    url: `/api/workspaces/${visitor}`,
    body: {
      version: 2,
      layoutMode: 'split',
      selectedModel: 'sonnet',
      tabs: { open: ['overview', 'views/second', 'views/first'], active: 'views/first' }
    }
  })
  expect(writes[1].url).toBe('/api/remote/alice/workspaces/board')
  expect(writes[1].body.widgetGrid).toBeDefined()
  expect(writes[1].body).not.toHaveProperty('tabs')
})
test('remote modules, styles and cache identities distinguish owners', () => {
  expect(workspaceBase('local')).toBe('/api/workspaces/local')
  expect(appletUrl('views', visitor, 'counter')).toBe(
    '/api/remote/alice/workspaces/board/views/counter/module?v=0'
  )
  expect(appletStyleKey('views', visitor, 'counter')).toBe(
    '/api/remote/alice/workspaces/board/views/counter'
  )
  expect(appletKey('views', visitor, 'counter')).not.toBe(appletKey('views', other, 'counter'))
})

test('loads visitor tab order and selection instead of the owner tabs', async () => {
  spies.push(
    mockFetch(async input =>
      Response.json(
        String(input) === `/api/workspaces/${visitor}`
          ? {
              version: 2,
              remote: { user_id: 'alice', workspace_id: 'board' },
              tabs: { open: ['overview', 'views/second', 'views/first'], active: 'views/first' }
            }
          : {
              ...createDefaultWorkspaceLayout(),
              tabs: { open: ['overview', 'scratchpad'], active: 'scratchpad' }
            }
      )
    )
  )
  expect((await loadWorkspaceLayout(visitor)).tabs).toEqual({
    open: ['overview', 'views/second', 'views/first'],
    active: 'views/first'
  })
})
