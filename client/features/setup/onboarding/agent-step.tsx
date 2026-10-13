import { OnboardingLayout } from './onboarding-layout'

export function AgentStep() {
  return (
    <OnboardingLayout title="Connect an agent" description="Set up an agent to use moi.">
      {/* Installation and login substeps will live here. */}
      <p className="text-sm text-muted-foreground">Agent setup will appear here.</p>
    </OnboardingLayout>
  )
}
