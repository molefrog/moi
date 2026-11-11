import { remoteFromIdentity } from '@/lib/workspace-identity'
import { cloudRequest } from '../../account/api'
import { jsonRequest } from '@/client/api/http'
import { parseWorkspaceMembers, validWorkspaceId } from './types'

function workspaceMembersPath(id: string, suffix: string) {
  const remote = remoteFromIdentity(id)
  const workspaceId = validWorkspaceId(remote?.workspace_id ?? id)
  return `workspaces/${encodeURIComponent(workspaceId)}/${suffix}${remote ? `?owner_id=${encodeURIComponent(remote.user_id)}` : ''}`
}
export async function fetchWorkspaceMembers(id: string, signal?: AbortSignal) {
  const response = await cloudRequest(workspaceMembersPath(id, 'members'), { signal })
  return parseWorkspaceMembers(await response.json())
}
export const inviteWorkspaceMember = (id: string, email: string, workspaceName?: string) =>
  cloudRequest(
    workspaceMembersPath(id, 'invitations'),
    jsonRequest('POST', { email, workspaceName })
  )
export const removeWorkspaceMember = (id: string, membershipId: string) =>
  cloudRequest(workspaceMembersPath(id, `members/${encodeURIComponent(membershipId)}`), {
    method: 'DELETE'
  })
export const revokeWorkspaceInvitation = (id: string, invitationId: string) =>
  cloudRequest(workspaceMembersPath(id, `invitations/${encodeURIComponent(invitationId)}`), {
    method: 'DELETE'
  })
