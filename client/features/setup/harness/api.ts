import { useQuery } from '@tanstack/react-query'
import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import type {
  HarnessAvailability,
  HarnessLogin,
  HarnessLoginState,
  WorkspaceType
} from '@/lib/types'

export function startHarnessLogin(type: WorkspaceType): Promise<HarnessLogin> {
  return requestJson(
    `/api/harnesses/${type}/auth/login`,
    { method: 'POST' },
    'Could not start sign-in'
  )
}

export type HarnessAuth = {
  availability: HarnessAvailability
  login?: HarnessLoginState
}

export function useHarnessConnection(type: WorkspaceType) {
  return useQuery({
    queryKey: ['harness-auth', type],
    queryFn: () => requestJson<HarnessAuth>(`/api/harnesses/${type}/auth`),
    staleTime: 2_000,
    refetchInterval: 2_000
  })
}

export function submitHarnessLoginCode(type: WorkspaceType, id: string, code: string) {
  return requestVoid(`/api/harnesses/${type}/auth/login/${id}/code`, jsonRequest('POST', { code }))
}

export function cancelHarnessLogin(type: WorkspaceType, id: string) {
  return requestVoid(`/api/harnesses/${type}/auth/login/${id}`, { method: 'DELETE' })
}
