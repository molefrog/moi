import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query'
import { getIdentityGeneration } from '../identity/store'
import { useIdentity } from '../identity/use-identity'
import { workspaceMembersKey, ownerOnlyWorkspaceMembers } from './store'
import {
  fetchWorkspaceMembers,
  inviteWorkspaceMember,
  removeWorkspaceMember,
  revokeWorkspaceInvitation
} from './api'
import type { WorkspaceMembers } from './types'

export type MembershipAction =
  | { type: 'invite'; email: string }
  | { type: 'remove'; membershipId: string }
  | { type: 'revoke'; invitationId: string }

type PendingAction = { id: number; action: MembershipAction }
export function applyPendingMembership(
  data: WorkspaceMembers | undefined,
  actions: PendingAction[]
) {
  if (!data) return undefined
  let { members, invitations } = data
  for (const { id, action } of actions) {
    if (action.type === 'remove')
      members = members.filter(member => member.membershipId !== action.membershipId)
    else if (action.type === 'revoke')
      invitations = invitations.filter(invitation => invitation.id !== action.invitationId)
    else if (!invitations.some(invitation => invitation.email === action.email))
      invitations = [
        ...invitations,
        { id: `pending:${id}`, email: action.email, expiresAt: '', pending: true }
      ]
  }
  return { members, invitations }
}
export function useWorkspaceMembers(workspaceId: string | undefined) {
  const identity = useIdentity()
  const enabled = !!workspaceId && identity?.type === 'user' && !identity.isAnonymous
  const generation = getIdentityGeneration()
  const mutationKey = ['workspace-members-action', generation, workspaceId]
  const query = useQuery({
    queryKey: workspaceMembersKey(workspaceId ?? ''),
    initialData: ownerOnlyWorkspaceMembers,
    queryFn: async ({ signal }) => {
      const snapshot = await fetchWorkspaceMembers(workspaceId!, signal)
      if (signal.aborted || generation !== getIdentityGeneration())
        throw new Error('Identity changed')
      return snapshot
    },
    enabled,
    retry: false,
    staleTime: 30_000
  })
  const pending = useMutationState({
    filters: { mutationKey, status: 'pending', exact: true },
    select: mutation => ({
      id: mutation.state.submittedAt,
      action: mutation.state.variables as MembershipAction
    })
  })
  const data = applyPendingMembership(query.data, pending)
  return { ...query, data, members: data?.members, invitations: data?.invitations }
}
function useMembershipAction(workspaceId: string) {
  const identity = useIdentity()
  const generation = getIdentityGeneration()
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['workspace-members-action', generation, workspaceId],
    mutationFn: async (action: MembershipAction) => {
      if (
        !identity ||
        identity.type !== 'user' ||
        identity.isAnonymous ||
        generation !== getIdentityGeneration()
      )
        throw new Error('Sign in to manage workspace members')
      if (action.type === 'invite') return inviteWorkspaceMember(workspaceId, action.email)
      if (action.type === 'remove') return removeWorkspaceMember(workspaceId, action.membershipId)
      return revokeWorkspaceInvitation(workspaceId, action.invitationId)
    },
    onSuccess: async () => {
      if (generation !== getIdentityGeneration()) return
      // Keep the optimistic overlay until the canonical snapshot has caught up.
      await client.invalidateQueries({ queryKey: workspaceMembersKey(workspaceId), exact: true })
    }
  })
}
export function useInviteMember(workspaceId: string) {
  const mutation = useMembershipAction(workspaceId)
  return {
    ...mutation,
    mutate: ({ email }: { email: string }) =>
      mutation.mutate({ type: 'invite', email: email.trim().toLowerCase() })
  }
}
export function useRemoveMember(workspaceId: string) {
  const mutation = useMembershipAction(workspaceId)
  return {
    ...mutation,
    mutate: ({ membershipId }: { membershipId: string }) =>
      mutation.mutate({ type: 'remove', membershipId })
  }
}
export function useRevokeInvitation(workspaceId: string) {
  const mutation = useMembershipAction(workspaceId)
  return {
    ...mutation,
    mutate: ({ invitationId }: { invitationId: string }) =>
      mutation.mutate({ type: 'revoke', invitationId })
  }
}
