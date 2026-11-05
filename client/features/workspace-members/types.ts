import { isRecord } from '@/lib/collab/protocol'
import { identityKey, parseIdentity } from '../identity/types'
import type { Identity } from '../identity/types'

export type WorkspaceMember = Identity & { membershipId?: string }
export type WorkspaceInvitation = {
  id: string
  email: string
  expiresAt: string
  pending?: boolean
}
export type WorkspaceMembers = { members: WorkspaceMember[]; invitations: WorkspaceInvitation[] }
export type WorkspaceMembersSnapshot = WorkspaceMembers & { id: string }
export function parseWorkspaceMembers(value: unknown): WorkspaceMembers {
  if (!isRecord(value) || !Array.isArray(value.members) || !Array.isArray(value.invitations))
    throw new Error('Invalid workspace members')
  const members = value.members.map(member => {
    const identity = parseIdentity(member)
    if (isRecord(member) && member.membershipId !== undefined) {
      if (
        typeof member.membershipId !== 'string' ||
        !member.membershipId ||
        member.membershipId.length > 240
      )
        throw new Error('Invalid membership id')
      return { ...identity, membershipId: member.membershipId }
    }
    return identity
  })
  const invitations = value.invitations.map(invitation => {
    if (
      !isRecord(invitation) ||
      typeof invitation.id !== 'string' ||
      !invitation.id ||
      typeof invitation.email !== 'string' ||
      !invitation.email ||
      typeof invitation.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(invitation.expiresAt))
    )
      throw new Error('Invalid invitation')
    return { id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt }
  })
  if (
    new Set(members.map(identityKey)).size !== members.length ||
    new Set(invitations.map(invitation => invitation.id)).size !== invitations.length
  )
    throw new Error('Duplicate workspace member or invitation')
  return { members, invitations }
}
export function validWorkspaceId(id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) throw new Error('Invalid workspace id')
  return id
}
