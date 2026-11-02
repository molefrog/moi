import { useState } from 'react'
import { Redirect } from 'wouter'
import { useSaveAppSettings } from '@/client/features/settings/api'
import type { OnboardingHarness } from '@/lib/onboarding'
import { useOnboardingSettings } from './api'
import { OnboardingStatus } from './onboarding-status'
import { AgentSetupStep } from './agent-setup-step'
import { WorkspaceSetupStep } from './workspace-setup-step'

export function OnboardingPage() {
  const onboarding = useOnboardingSettings()
  const save = useSaveAppSettings()
  const [destination, setDestination] = useState('/')
  const [harness, setHarness] = useState<OnboardingHarness>()
  if (onboarding.loading || onboarding.error)
    return <OnboardingStatus error={onboarding.error || undefined} onRetry={onboarding.retry} />
  if (!onboarding.enabled || !onboarding.data?.showOnboarding) return <Redirect to={destination} />

  function finish(workspaceId: string) {
    setDestination(`/workspace/${workspaceId}/overview`)
    save.mutate({ showOnboarding: false })
  }
  if (!harness) return <AgentSetupStep onComplete={setHarness} />
  return (
    <WorkspaceSetupStep
      harness={harness}
      onFinish={finish}
      finishing={save.isPending}
      finishError={save.error?.message}
    />
  )
}
