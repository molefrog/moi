import { queryOptions } from '@tanstack/react-query'
import { jsonRequest } from '@/client/api/http'
import { isRecord, isUserProfile } from '@/lib/collab/protocol'

export type CloudSession = {
  user: { id: string; email: string; name: string; isAnonymous: boolean }
} | null
export type TeamMember = {
  id: string
  userId: string
  email: string
  name: string
  role: string
  me: boolean
}
export type TeamInvitation = { id: string; email: string; role: string; expiresAt: string }
export type CloudTeam = {
  id: string
  name: string
  role: string
  members: TeamMember[]
  invitations: TeamInvitation[]
}

export const accountKeys = {
  all: ['account'] as const,
  session: ['account', 'session'] as const,
  team: ['account', 'team'] as const
}

export class CloudApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export async function cloudRequest(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`/cloud/api/auth/${path}`, { ...init, credentials: 'same-origin' })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined)
    const message = isRecord(body)
      ? [body.error, body.message].find(
          (value): value is string => typeof value === 'string' && value.trim().length > 0
        )
      : undefined
    throw new CloudApiError(
      message ?? 'Couldn’t complete this request. Try again.',
      response.status
    )
  }
  return response
}

function validProfile(id: unknown, name: unknown, email: unknown): boolean {
  return (
    typeof id === 'string' &&
    id === id.trim() &&
    typeof name === 'string' &&
    typeof email === 'string' &&
    isUserProfile({ id, name: name.trim() || undefined, email, color: 'blue' })
  )
}

function parseSession(value: unknown): CloudSession {
  if (value === null) return null
  if (
    !isRecord(value) ||
    !isRecord(value.user) ||
    !validProfile(value.user.id, value.user.name, value.user.email) ||
    typeof value.user.isAnonymous !== 'boolean'
  )
    throw new Error('Invalid account response')
  return value as NonNullable<CloudSession>
}

function parseTeam(value: unknown): CloudTeam {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.role !== 'string' ||
    !Array.isArray(value.members) ||
    !Array.isArray(value.invitations) ||
    !value.members.every(
      member =>
        isRecord(member) &&
        typeof member.id === 'string' &&
        validProfile(member.userId, member.name, member.email) &&
        typeof member.role === 'string' &&
        typeof member.me === 'boolean'
    ) ||
    !value.invitations.every(
      invitation =>
        isRecord(invitation) &&
        validProfile(invitation.id, '', invitation.email) &&
        typeof invitation.role === 'string' &&
        typeof invitation.expiresAt === 'string' &&
        Number.isFinite(Date.parse(invitation.expiresAt))
    )
  )
    throw new Error('Invalid users response')
  const team = value as CloudTeam
  if (
    new Set(team.members.map(member => member.userId)).size !== team.members.length ||
    new Set(team.members.map(member => member.id)).size !== team.members.length ||
    new Set(team.invitations.map(invitation => invitation.id)).size !== team.invitations.length
  )
    throw new Error('Invalid users response')
  return team
}

export const sessionQuery = queryOptions({
  queryKey: accountKeys.session,
  queryFn: async ({ signal }) => {
    const response = await cloudRequest('get-session', { signal })
    return parseSession(await response.json())
  },
  retry: false,
  staleTime: 30_000
})
export const teamQuery = (userId?: string) =>
  queryOptions({
    queryKey: [...accountKeys.team, userId],
    queryFn: async ({ signal }) => {
      const response = await cloudRequest('organization', { signal })
      return parseTeam(await response.json())
    },
    retry: false,
    staleTime: 30_000
  })
export const updateCloudName = (name: string) =>
  cloudRequest('profile', jsonRequest('POST', { name }))
export const signOutCloud = () => cloudRequest('sign-out', jsonRequest('POST'))
export const inviteMember = (email: string) =>
  cloudRequest('invite', jsonRequest('POST', { email }))
export const cancelInvitation = (id: string) =>
  cloudRequest(`invitation/${encodeURIComponent(id)}/cancel`, jsonRequest('POST'))
export const removeMember = (memberId: string) =>
  cloudRequest('members/remove', jsonRequest('POST', { memberId }))
