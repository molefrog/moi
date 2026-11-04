import { Button } from '@/client/components/ui/button'
import { HarnessLoginPanel } from '@/client/features/harness/harness-login-panel'
import { harnessLabel } from '@/client/features/harness/harness-presentation'
import type { LoginHarness } from '@/client/features/harness/api'

type WorkspaceLoginStateProps = {
  type: LoginHarness
  reason: string
  checking: boolean
  onRecheck: () => void
  onConnected?: () => void
}

export function WorkspaceLoginState({
  type,
  reason,
  checking,
  onRecheck,
  onConnected = onRecheck
}: WorkspaceLoginStateProps) {
  return (
    <HarnessLoginPanel
      type={type}
      onConnected={onConnected}
      connectedContent={
        <WorkspaceAccessState
          name={harnessLabel[type]}
          reason={reason}
          checking={checking}
          onRecheck={onRecheck}
        />
      }
    />
  )
}

type WorkspaceAccessStateProps = {
  name: string
  reason: string
  checking: boolean
  onRecheck: () => void
}

function WorkspaceAccessState({ name, reason, checking, onRecheck }: WorkspaceAccessStateProps) {
  let message = `Logged in to ${name}, but this workspace still needs attention. ${reason}`
  if (checking) message = 'Checking workspace access…'

  return (
    <div role="status" className="mt-6 flex flex-col items-center gap-4">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="secondary" disabled={checking} onClick={onRecheck}>
        Try again
      </Button>
    </div>
  )
}
