import { useAppConfig } from '@/client/api/app-config'
import { useCallback, useState } from 'react'
import { HarnessSelector } from '@/client/features/harness/harness-selector'
import { HarnessLoginPanel } from '@/client/features/harness/harness-login-panel'
import { harnessDescription } from '@/client/features/harness/harness-presentation'
import { useHarnessStatuses } from '@/client/features/harness/api'
import type { OnboardingHarness } from '@/lib/onboarding'
import { OnboardingStatus } from './onboarding-status'
import { OnboardingScreen } from './onboarding-screen'

type AgentSetupStepProps = { onComplete: (harness: OnboardingHarness) => void }
export function AgentSetupStep({ onComplete }: AgentSetupStepProps) {
  const [harness, setHarness] = useState<OnboardingHarness>()
  const onConnected = useCallback(() => {
    if (harness) onComplete(harness)
  }, [harness, onComplete])
  if (!harness) return <ChooseAgent onSelect={setHarness} />
  return <HarnessLoginPanel type={harness} onConnected={onConnected} />
}

type ChooseAgentProps = { onSelect: (harness: OnboardingHarness) => void }
function ChooseAgent({ onSelect }: ChooseAgentProps) {
  const { environment, demo } = useAppConfig()
  const canInstall = environment === 'local' && !demo
  const installed = useHarnessStatuses()
  if (installed.isPending || installed.error)
    return (
      <OnboardingStatus
        error={installed.error ?? undefined}
        onRetry={() => void installed.refetch()}
      />
    )
  const options = (['claude-code', 'codex'] as const).map(type => ({
    type,
    description: harnessDescription[type],
    disabled: !canInstall && installed.data[type].availability.status === 'unavailable',
    disabledReason:
      canInstall || installed.data[type].availability.status !== 'unavailable'
        ? undefined
        : 'This agent is not installed on your computer'
  }))
  return (
    <OnboardingScreen className="max-w-sm">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-xl font-medium">Choose your agent</h1>
        <p className="max-w-60 text-sm text-muted-foreground">
          Connect an existing subscription to build and personalize Moi
        </p>
      </div>
      <HarnessSelector
        options={options}
        mode="action"
        cardClassName="h-36"
        disabled={false}
        onTypeChange={type => {
          if (type === 'claude-code' || type === 'codex') onSelect(type)
        }}
      />
    </OnboardingScreen>
  )
}
