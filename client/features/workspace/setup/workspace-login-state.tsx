import { workspaceProviderIcon } from '@/client/components/shared/WorkspaceIcon'
import { Button } from '@/client/components/ui/button'
import { workspaceTypeLabel } from '@/client/features/workspace/workspace-presentation'
import { HarnessConnection, type LoginHarness } from '@/client/features/harness/harness-connection'

type WorkspaceLoginStateProps = {
  type: LoginHarness
  reason: string
  checking: boolean
  onRecheck: () => void
}

export function WorkspaceLoginState({
  type,
  reason,
  checking,
  onRecheck
}: WorkspaceLoginStateProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6 text-center">
        <img src={workspaceProviderIcon[type]} alt="" className="size-10 self-center" />
        <h1 className="text-center text-xl font-medium">Connect your {workspaceTypeLabel[type]}</h1>
        <HarnessConnection
          type={type}
          onConnected={onRecheck}
          connectedContent={
            <div role="status" className="flex flex-col items-center gap-4">
              <p className="text-sm text-muted-foreground">
                {checking
                  ? 'Checking workspace access…'
                  : `Signed in to ${workspaceTypeLabel[type]}, but this workspace still needs attention. ${reason}`}
              </p>
              <Button variant="secondary" disabled={checking} onClick={onRecheck}>
                Try again
              </Button>
            </div>
          }
        />
      </div>
    </div>
  )
}
