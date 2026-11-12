import { afterEach, expect, spyOn, test } from 'bun:test'
import { queryClient } from '@/client/api/query-client'
import { workspaceKeys } from '@/client/api/workspace-keys'
import {
  fetchWorkspaceMembers,
  inviteWorkspaceMember,
  removeWorkspaceMember,
  revokeWorkspaceInvitation
} from './api'

let fetchSpy: ReturnType<typeof spyOn> | undefined
afterEach(() => {
  fetchSpy?.mockRestore()
  queryClient.removeQueries({ queryKey: workspaceKeys.all, exact: true })
})

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
  const id = 'visitor-board'
  queryClient.setQueryData(workspaceKeys.all, [
    { id, path: '/visitor-board', addedAt: '', remote: { user_id: 'alice', workspace_id: 'board' } }
  ])
  await fetchWorkspaceMembers(id)
  await inviteWorkspaceMember(id, 'new@example.com')
  await removeWorkspaceMember(id, 'member-1')
  await revokeWorkspaceInvitation(id, 'invite-1')
  expect(calls).toEqual([
    { url: '/cloud/api/workspaces/alice:board/members', method: 'GET' },
    { url: '/cloud/api/workspaces/alice:board/invitations', method: 'POST' },
    { url: '/cloud/api/workspaces/alice:board/members/member-1', method: 'DELETE' },
    { url: '/cloud/api/workspaces/alice:board/invitations/invite-1', method: 'DELETE' }
  ])
})
