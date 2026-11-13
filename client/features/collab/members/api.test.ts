import { setWorkspaceApiTarget } from '@/client/features/workspace/remote'
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
  queryClient.removeQueries({ queryKey: workspaceKeys.all })
})

test.each([false, true])(
  'membership actions use the resolved prefix (remote: %s)',
  async remote => {
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
    const target = setWorkspaceApiTarget(
      id,
      remote ? { user_id: 'alice', workspace_id: 'board' } : undefined
    )
    expect(target).toEqual({
      apiBase: remote ? '/api/workspaces/alice:board' : '/api/workspaces/visitor-board',
      isRemote: remote
    })
    await fetchWorkspaceMembers(id)
    await inviteWorkspaceMember(id, 'new@example.com')
    await removeWorkspaceMember(id, 'member-1')
    await revokeWorkspaceInvitation(id, 'invite-1')
    expect(calls).toEqual([
      { url: `/cloud${target.apiBase}/members`, method: 'GET' },
      { url: `/cloud${target.apiBase}/invitations`, method: 'POST' },
      { url: `/cloud${target.apiBase}/members/member-1`, method: 'DELETE' },
      { url: `/cloud${target.apiBase}/invitations/invite-1`, method: 'DELETE' }
    ])
  }
)
