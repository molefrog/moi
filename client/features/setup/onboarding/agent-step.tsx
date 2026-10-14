import type { HarnessInstallations } from '@/lib/types'
import { HarnessConnection } from './harness/harness-connection'
import { OnboardingLayout } from './onboarding-layout'

type AgentStepProps = {
  installed: HarnessInstallations
}

export function AgentStep({ installed }: AgentStepProps) {
  return (
    <OnboardingLayout title="Connect an agent" description="Connect at least one agent to use moi.">
      <div className="flex flex-col gap-8">
        <HarnessConnection type="claude-code" installed={installed['claude-code']} />
        <HarnessConnection type="codex" installed={installed.codex} />
      </div>
    </OnboardingLayout>
  )
}
