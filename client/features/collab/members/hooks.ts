import { CloudApiError } from '../../account/api'
import { remoteFromIdentity } from '@/lib/workspace-identity'
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspaces } from '../../home/api'
import { getAccountGeneration } from '../../identity/store'
import { useIdentity } from '../../identity/use-identity'
import { ownerOnlyWorkspaceMembers, removeWorkspaceMembers } from './store'
import { memberKeys } from './keys'
import { identityKey } from '../../identity/types'
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
  const accountId = identity ? identityKey(identity) : undefined
  const remote = workspaceId ? remoteFromIdentity(workspaceId) : undefined
  const enabled = !!workspaceId && identity?.type === 'user' && !identity.isAnonymous
  const accountGeneration = getAccountGeneration()
  const mutationKey = ['workspace-members-action', accountGeneration, workspaceId]
  const query = useQuery({
    queryKey: memberKeys.workspace(accountId, workspaceId ?? ''),
    initialData: remote ? undefined : ownerOnlyWorkspaceMembers,
    queryFn: async ({ signal }) => {
      try {
        const snapshot = await fetchWorkspaceMembers(workspaceId!, signal)
        if (signal.aborted || accountGeneration !== getAccountGeneration())
          throw new Error('Identity changed')
        return snapshot
      } catch (error) {
        if (
          remote &&
          !signal.aborted &&
          accountGeneration === getAccountGeneration() &&
          error instanceof CloudApiError &&
          (error.status === 403 || error.status === 404)
        ) {
          removeWorkspaceMembers(workspaceId!)
        }
        throw error
      }
    },
    enabled,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 30_000
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
export function useMembershipAction(workspaceId: string) {
  const workspaces = useWorkspaces()

  const identity = useIdentity()
  const accountId = identity ? identityKey(identity) : undefined
  const accountGeneration = getAccountGeneration()
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['workspace-members-action', accountGeneration, workspaceId],
    mutationFn: async (action: MembershipAction) => {
      if (
        !identity ||
        identity.type !== 'user' ||
        identity.isAnonymous ||
        accountGeneration !== getAccountGeneration()
      )
        throw new Error('Sign in to manage workspace members')
      if (action.type === 'invite') {
        const name = workspaces.data?.find(workspace => workspace.id === workspaceId)?.name
        return inviteWorkspaceMember(workspaceId, action.email, name?.trim() || undefined)
      }
      if (action.type === 'remove') return removeWorkspaceMember(workspaceId, action.membershipId)
      return revokeWorkspaceInvitation(workspaceId, action.invitationId)
    },
    onSuccess: async () => {
      if (accountGeneration !== getAccountGeneration()) return
      // Keep the optimistic overlay until the canonical snapshot has caught up.
      await client.invalidateQueries({
        queryKey: memberKeys.workspace(accountId, workspaceId),
        exact: true
      })
    }
  })
}
