import { queryOptions } from '@tanstack/react-query'
import { jsonRequest } from '@/client/api/http'

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

export async function cloudRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/cloud/api/auth/${path}`, { ...init, credentials: 'same-origin' })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined)
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'Couldn’t complete this request. Try again.'
    throw new CloudApiError(message, response.status)
  }
  return response.json() as Promise<T>
}

export const sessionQuery = queryOptions({
  queryKey: accountKeys.session,
  queryFn: ({ signal }) => cloudRequest<CloudSession>('get-session', { signal }),
  retry: false,
  staleTime: 30_000
})
export const teamQuery = (userId?: string) =>
  queryOptions({
    queryKey: [...accountKeys.team, userId],
    queryFn: ({ signal }) => cloudRequest<CloudTeam>('organization', { signal }),
    retry: false,
    staleTime: 30_000
  })
export const updateCloudName = (name: string) =>
  cloudRequest<{ success: true; name: string }>('profile', jsonRequest('POST', { name }))
export const signOutCloud = () => cloudRequest<unknown>('sign-out', jsonRequest('POST'))
export const inviteMember = (email: string) =>
  cloudRequest<TeamInvitation>('invite', jsonRequest('POST', { email }))
export const cancelInvitation = (id: string) =>
  cloudRequest<unknown>(`invitation/${encodeURIComponent(id)}/cancel`, jsonRequest('POST'))
export const removeMember = (memberId: string) =>
  cloudRequest<unknown>('members/remove', jsonRequest('POST', { memberId }))
