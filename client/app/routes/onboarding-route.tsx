import { ScreenShell } from '@/client/components/shared/screen-shell'
import { OnboardingPage } from '@/client/features/onboarding/onboarding-page'
export function OnboardingRoute() {
  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <ScreenShell>
        <OnboardingPage />
      </ScreenShell>
    </main>
  )
}
