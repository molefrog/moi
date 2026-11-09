import { queryOptions } from '@tanstack/react-query'
import { jsonRequest } from '@/client/api/http'
import { isRecord } from '@/lib/collab/protocol'
import { parseIdentity } from '../identity/types'
import { getIdentityRevision, setIdentity } from '../identity/store'
import type { Identity } from '../identity/types'

export const accountKeys = {
  all: ['account'] as const,
  identityRefresh: ['account', 'identity-refresh'] as const
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
  const response = await fetch(`/cloud/api/${path}`, { ...init, credentials: 'same-origin' })
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
// React Query tracks refresh status only. Identity itself lives in the identity store.
export const identityRefreshQuery = queryOptions({
  queryKey: accountKeys.identityRefresh,
  queryFn: async ({ signal }): Promise<true> => {
    const identityRevision = getIdentityRevision()
    let identity: Identity | null
    try {
      identity = parseIdentity(await (await cloudRequest('me', { signal })).json())
    } catch (error) {
      if (!(error instanceof CloudApiError) || error.status !== 401) throw error
      identity = null
    }
    // A pushed identity or account switch wins over an older request.
    if (!signal.aborted && getIdentityRevision() === identityRevision) setIdentity(identity)
    return true
  },
  retry: false,
  staleTime: 30_000
})
type ProfilePatch = { name: string }
export const updateCloudProfile = async (patch: ProfilePatch) =>
  parseIdentity(await (await cloudRequest('me', jsonRequest('PATCH', patch))).json())
export async function uploadCloudAvatar(file: File) {
  const body = new FormData()
  body.set('file', file)
  return parseIdentity(await (await cloudRequest('me/avatar', { method: 'PUT', body })).json())
}
export const removeCloudAvatar = async () =>
  parseIdentity(await (await cloudRequest('me/avatar', { method: 'DELETE' })).json())
export const signOutCloud = () => cloudRequest('auth/sign-out', jsonRequest('POST'))
