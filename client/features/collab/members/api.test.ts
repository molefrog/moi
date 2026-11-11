import { afterEach, expect, spyOn, test } from 'bun:test'
import { workspaceIdentity } from '@/lib/workspace-identity'
import {
  fetchWorkspaceMembers,
  inviteWorkspaceMember,
  removeWorkspaceMember,
  revokeWorkspaceInvitation
} from './api'

let fetchSpy: ReturnType<typeof spyOn> | undefined
afterEach(() => fetchSpy?.mockRestore())

test('remote membership actions use the same host workspace', async () => {
  const calls: { url: string; method: string }[] = []
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), method: init?.method ?? 'GET' })
        return Response.json({ members: [], invitations: [] })
      },
      { preconnect: fetch.preconnect }
    )
  )
  const id = workspaceIdentity({ id: 'board', remote: { user_id: 'alice', workspace_id: 'board' } })
  await fetchWorkspaceMembers(id)
  await inviteWorkspaceMember(id, 'new@example.com')
  await removeWorkspaceMember(id, 'member-1')
  await revokeWorkspaceInvitation(id, 'invite-1')
  expect(calls).toEqual([
    { url: '/cloud/api/workspaces/board/members?owner_id=alice', method: 'GET' },
    { url: '/cloud/api/workspaces/board/invitations?owner_id=alice', method: 'POST' },
    { url: '/cloud/api/workspaces/board/members/member-1?owner_id=alice', method: 'DELETE' },
    { url: '/cloud/api/workspaces/board/invitations/invite-1?owner_id=alice', method: 'DELETE' }
  ])
})
