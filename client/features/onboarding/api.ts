import { useQuery } from '@tanstack/react-query'
import { useAppConfig } from '@/client/api/app-config'
import { jsonRequest, requestJson } from '@/client/api/http'
import { useAppSettings } from '@/client/features/app-settings/api'
import type { IdeaDiscovery, OnboardingJobResult } from '@/lib/onboarding'

export function useOnboardingSettings() {
  const config = useAppConfig()
  const enabled = !config.demo
  const settings = useAppSettings()
  return {
    ...settings,
    enabled,
    loading: enabled && settings.isPending,
    error: enabled ? settings.error : undefined,
    retry: () => void settings.refetch()
  }
}

export function cancelDiscovery(runId: string) {
  return requestJson('/api/onboarding/cancel', jsonRequest('POST', { runId }))
}

type BuildRequest = IdeaDiscovery & { ideaId: string; operationId: string }
export function useOnboardingJob(
  action: 'discover' | 'create',
  request?: IdeaDiscovery | BuildRequest,
  retry = false
) {
  return useQuery({
    queryKey: ['onboarding-job', action, request, retry],
    queryFn: ({ signal }) =>
      requestJson<OnboardingJobResult>(`/api/onboarding/${action}`, {
        ...jsonRequest('POST', { ...request, retry }),
        signal
      }),
    enabled: !!request,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: query => (query.state.data?.status === 'running' ? 1500 : false)
  })
}
