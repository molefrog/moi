import { useEffect, type ReactNode } from 'react'
import { useQueries, useQueryClient } from '@tanstack/react-query'

import { useAppConfig } from '@/client/api/app-config'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { Button } from '@/client/components/ui/button'
import { Skeleton } from '@/client/components/ui/skeleton'
import { useWorkspaces } from '@/client/features/home/api'
import { harnessAuthOptions, useWorkspaceSetupInfo } from '@/client/features/setup/api'
import { onWorkspaceEventsReconnect, useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'

import { AgentStep } from './agent-step'
import { OnboardingLayout } from './onboarding-layout'
import { getOnboardingStep } from './onboarding-step'
import { WorkspaceStep } from './workspace-step'

type OnboardingFlowProps = {
  children: ReactNode
}

export function OnboardingFlow({ children }: OnboardingFlowProps) {
  const { demo } = useAppConfig()
  if (demo) return children
  return <DetectedOnboardingFlow>{children}</DetectedOnboardingFlow>
}

function DetectedOnboardingFlow({ children }: OnboardingFlowProps) {
  const { environment } = useAppConfig()
  const agents = useWorkspaceSetupInfo()
  const workspaces = useWorkspaces()
  const needsAuth = workspaces.data?.length === 0
  const auth = useQueries({
    queries: (['claude-code', 'codex'] as const)
      .filter(type => needsAuth && agents.data?.installed[type])
      .map(harnessAuthOptions)
  })
  const authFailed = auth.some(
    query => query.isError || query.data?.availability.status === 'unavailable'
  )
  const queryClient = useQueryClient()

  // Keep detection alive even when onboarding replaces the normal app shell.
  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['harness-auth'] })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.setupInfo, exact: true })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true })
    }
    window.addEventListener('focus', refresh)
    const unsubscribe = onWorkspaceEventsReconnect(refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      unsubscribe()
    }
  }, [queryClient])

  useWorkspaceEvent(event => {
    if (event.type === 'workspaces-list:updated') {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true })
    }
  })

  if (agents.isError || workspaces.isError || authFailed) {
    return (
      <OnboardingLayout title="Could not check your setup">
        <div role="alert" className="flex flex-col items-start gap-4">
          <p className="text-sm text-muted-foreground">
            Try again to load your agents and workspaces.
          </p>
          <Button
            disabled={
              agents.isFetching || workspaces.isFetching || auth.some(query => query.isFetching)
            }
            onClick={() => {
              void agents.refetch()
              void workspaces.refetch()
              for (const query of auth) void query.refetch()
            }}
          >
            Try again
          </Button>
        </div>
      </OnboardingLayout>
    )
  }

  if (agents.isPending || workspaces.isPending || auth.some(query => query.isPending)) {
    return (
      <OnboardingLayout title="Getting ready">
        <div
          role="status"
          aria-label="Checking agents and workspaces"
          className="flex flex-col gap-3"
        >
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-32 w-full" />
        </div>
      </OnboardingLayout>
    )
  }

  const step = getOnboardingStep(
    environment,
    agents.data.installed,
    workspaces.data.length,
    auth.some(query => query.data?.availability.status === 'available')
  )
  if (step === 'agent') return <AgentStep installed={agents.data.installed} />
  if (step === 'workspace') return <WorkspaceStep />
  return children
}
