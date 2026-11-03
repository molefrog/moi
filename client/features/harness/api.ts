import { queryOptions, useQuery } from '@tanstack/react-query'
import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import type { HarnessStatuses, HarnessLogin, WorkspaceType } from '@/lib/types'

export function startHarnessLogin(type: WorkspaceType): Promise<HarnessLogin> {
  return requestJson(
    `/api/harnesses/${type}/auth/login`,
    { method: 'POST' },
    'Could not start sign-in'
  )
}

export type LoginHarness = 'claude-code' | 'codex'

export type { HarnessStatus } from '@/lib/types'

const harnessStatusOptions = queryOptions({
  queryKey: ['harness-status'],
  queryFn: ({ signal }) =>
    requestJson<HarnessStatuses>('/api/harnesses/status?refresh=true', { signal }),
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnWindowFocus: 'always',
  refetchInterval: query =>
    Object.values(query.state.data ?? {}).some(
      status => status.login?.state === 'starting' || status.login?.state === 'pending'
    )
      ? 2_000
      : false
})

export function useHarnessStatuses() {
  return useQuery(harnessStatusOptions)
}

export function useHarnessStatus(type: WorkspaceType | undefined) {
  return useQuery({
    ...harnessStatusOptions,
    enabled: type === 'claude-code' || type === 'codex',
    select: statuses => (type ? statuses[type] : undefined)
  })
}

export function submitHarnessLoginCode(type: WorkspaceType, id: string, code: string) {
  return requestVoid(`/api/harnesses/${type}/auth/login/${id}/code`, jsonRequest('POST', { code }))
}

export function installHarness(type: LoginHarness) {
  return requestVoid(`/api/harnesses/${type}/auth/install`, { method: 'POST' })
}
