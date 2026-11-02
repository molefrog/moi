import { Button } from '@/client/components/ui/button'
import { Spinner } from '@/client/components/ui/spinner'

type OnboardingStatusProps = { error?: Error; onRetry: () => void }
export function OnboardingStatus({ error, onRetry }: OnboardingStatusProps) {
  if (error)
    return (
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  return (
    <div
      role="status"
      aria-label="Loading onboarding"
      className="flex flex-1 items-center justify-center"
    >
      <Spinner className="size-6 text-muted-foreground" stroke={1.5} />
    </div>
  )
}
