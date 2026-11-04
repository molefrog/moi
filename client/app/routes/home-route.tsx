import { ScreenShell } from '@/client/components/shared/screen-shell'
import { Redirect } from 'wouter'
import { useOnboardingSettings } from '@/client/features/onboarding/api'
import { OnboardingStatus } from '@/client/features/onboarding/onboarding-status'
import { SidebarLayout } from '@/client/app/shell/sidebar-layout'
import { HomePage } from '@/client/features/home/home-page'

// The `/` route: the app shell wrapping the workspaces view.
export function HomeRoute() {
  const onboarding = useOnboardingSettings()
  if (onboarding.loading || onboarding.error)
    return (
      <main className="flex h-dvh flex-col overflow-hidden">
        <ScreenShell>
          <OnboardingStatus error={onboarding.error || undefined} onRetry={onboarding.retry} />
        </ScreenShell>
      </main>
    )
  if (onboarding.enabled && onboarding.data?.showOnboarding) return <Redirect to="/onboarding" />
  return (
    <SidebarLayout showWorkspaces={false}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <HomePage />
      </div>
    </SidebarLayout>
  )
}
