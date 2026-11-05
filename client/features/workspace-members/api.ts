import { cloudRequest } from '../account/api'
import { getIdentity } from '../identity/store'
import { jsonRequest } from '@/client/api/http'
import { parseWorkspaceMembers, validWorkspaceId } from './types'

export const workspaceMembersPath = (id: string) =>
  `workspaces/${encodeURIComponent(validWorkspaceId(id))}`
export async function fetchWorkspaceMembers(id: string, signal?: AbortSignal) {
  const actor = getIdentity()
  const response = await cloudRequest(`${workspaceMembersPath(id)}/members`, { signal })
  const responseActor = response.headers.get('X-Moi-Identity')
  if (responseActor && (actor?.type !== 'user' || responseActor !== actor.id))
    throw new Error('Your account changed')
  return parseWorkspaceMembers(await response.json())
}
export const inviteWorkspaceMember = (id: string, email: string) =>
  cloudRequest(`${workspaceMembersPath(id)}/invitations`, jsonRequest('POST', { email }))
export const removeWorkspaceMember = (id: string, membershipId: string) =>
  cloudRequest(`${workspaceMembersPath(id)}/members/${encodeURIComponent(membershipId)}`, {
    method: 'DELETE'
  })
export const revokeWorkspaceInvitation = (id: string, invitationId: string) =>
  cloudRequest(`${workspaceMembersPath(id)}/invitations/${encodeURIComponent(invitationId)}`, {
    method: 'DELETE'
  })
