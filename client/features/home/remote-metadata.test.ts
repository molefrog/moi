import { workspaceIdentity } from '@/lib/workspace-identity'
import { afterEach, expect, spyOn, test } from 'bun:test'
import { loadWorkspacePreviews, resolveWorkspaceNames } from './api'
import type { WorkspaceEntry } from '@/lib/types'

const local: WorkspaceEntry = { id: 'local', path: '/local', addedAt: '', name: 'Local' }
const remote: WorkspaceEntry = {
  id: 'board',
  type: 'codex',
  path: '/visitor-alias',
  addedAt: '',
  remote: { user_id: 'alice', workspace_id: 'board' }
}
let fetchSpy: ReturnType<typeof spyOn> | undefined
afterEach(() => fetchSpy?.mockRestore())

test('list uses owner metadata while retaining visitor registration and order', async () => {
  const calls: string[] = []
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL) => {
        calls.push(String(input))
        return Response.json({
          name: 'Shared counter',
          provider: 'openclaw',
          agentId: 'owner-agent',
          icon: { type: 'emoji', value: '🌱' }
        })
      },
      { preconnect: fetch.preconnect }
    )
  )
  const result = await resolveWorkspaceNames([local, remote])
  expect(calls).toEqual(['/api/remote/alice/workspaces/board'])
  expect(result[0]).toBe(local)
  expect(result[1]).toEqual({
    ...remote,
    id: workspaceIdentity(remote),
    name: 'Shared counter',
    type: 'openclaw',
    agentId: 'owner-agent',
    icon: { type: 'emoji', value: '🌱' },
    theme: undefined
  })
})

test('an unavailable owner does not hide local or remote registrations', async () => {
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(async () => new Response('Offline', { status: 502 }), {
      preconnect: fetch.preconnect
    })
  )
  const entries = await resolveWorkspaceNames([remote, local])
  expect(entries[1]).toBe(local)
  expect(entries[0]).toMatchObject({
    id: workspaceIdentity(remote),
    remote: remote.remote,
    name: 'board'
  })
  expect(entries[0]?.type).toBeUndefined()
})

test('home previews use the owner and keep the visitor id for navigation', async () => {
  const calls: string[] = []
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        if (url === '/api/workspaces/previews')
          return Response.json({
            local: { thumbnails: ['local.png'] },
            [workspaceIdentity(remote)]: { thumbnails: [] }
          })
        return Response.json({
          thumbnails: ['/api/remote/alice/workspaces/board/applet-thumbnails/widget/counter:123']
        })
      },
      { preconnect: fetch.preconnect }
    )
  )
  const result = await loadWorkspacePreviews()
  expect(result.local?.thumbnails).toEqual(['local.png'])
  expect(result[workspaceIdentity(remote)]?.thumbnails).toEqual([
    '/api/remote/alice/workspaces/board/applet-thumbnails/widget/counter:123'
  ])
  expect(calls).toContain('/api/remote/alice/workspaces/board/home-preview')
  expect(calls).not.toContain('/api/workspaces/visitor/home-preview')
  expect(calls).not.toContain('/api/workspaces')
})

test('remote icon fallback uses the owner provider and clears visitor icons', async () => {
  for (const provider of ['codex', 'claude-code', undefined] as const) {
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      Object.assign(async () => Response.json({ name: 'Owner', provider }), {
        preconnect: fetch.preconnect
      })
    )
    const [entry] = await resolveWorkspaceNames([
      { ...remote, type: 'openclaw', icon: { type: 'emoji', value: '🌱' } }
    ])
    expect(entry?.type).toBe(provider ?? 'claude-code')
    expect(entry?.icon).toBeUndefined()
    fetchSpy.mockRestore()
  }
})

test('offline owner keeps previous owner metadata but never uses a different target', async () => {
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(async () => new Response('Offline', { status: 502 }), {
      preconnect: fetch.preconnect
    })
  )
  const visitor = {
    ...remote,
    name: 'Visitor name',
    agentId: 'visitor-agent',
    icon: { type: 'emoji' as const, value: 'V' }
  }
  const cached = {
    ...remote,
    id: workspaceIdentity(remote),
    name: 'Owner name',
    type: 'hermes' as const,
    agentId: 'owner-agent',
    icon: { type: 'emoji' as const, value: 'O' }
  }
  expect((await resolveWorkspaceNames([visitor], [cached]))[0]).toEqual(cached)
  const [changed] = await resolveWorkspaceNames(
    [{ ...visitor, remote: { user_id: 'bob', workspace_id: 'other' } }],
    [cached]
  )
  expect(changed?.name).toBe('other')
  expect(changed?.icon).toBeUndefined()
  expect(changed?.type).toBeUndefined()
  expect(changed?.agentId).toBeUndefined()
})
