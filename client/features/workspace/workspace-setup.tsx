import { Activity, useCallback, useState, type ReactNode } from 'react'

import { useAppConfig } from '@/client/api/app-config'
import { workspaceProviderIcon } from '@/client/components/shared/WorkspaceIcon'
import { Button } from '@/client/components/ui/button'
import { Spinner } from '@/client/components/ui/spinner'
import { workspaceTypeLabel } from '@/client/features/home/workspace-presentation'
import { HarnessConnection } from '@/client/features/setup/harness/harness-connection'
import { useWorkspaceAgent } from './api'

type WorkspaceSetupProps = {
  workspaceId: string
  children: ReactNode
}

export function WorkspaceSetup(props: WorkspaceSetupProps) {
  const { demo } = useAppConfig()
  return demo ? props.children : <CheckedWorkspaceSetup {...props} />
}

function CheckedWorkspaceSetup({ workspaceId, children }: WorkspaceSetupProps) {
  const { data, isError, isPending, isFetching, refetch } = useWorkspaceAgent(workspaceId)
  const [opened, setOpened] = useState(false)
  const ready = !isError && data?.availability.status === 'available'
  if (ready && !opened) setOpened(true)
  const recheck = useCallback(() => {
    void refetch()
  }, [refetch])

  if (isPending) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-background shadow-md">
        <Spinner className="text-muted-foreground" />
      </div>
    )
  }

  const type = data?.provider
  const canLogIn = type === 'claude-code' || type === 'codex'
  const needsLogin = data?.availability.status === 'login-required'
  const reason = data?.availability.status !== 'available' ? data?.availability.reason : undefined
  const retry = (
    <Button variant="secondary" disabled={isFetching} onClick={recheck}>
      Try again
    </Button>
  )

  return (
    <>
      {opened && <Activity mode={ready ? 'visible' : 'hidden'}>{children}</Activity>}
      {!ready && (
        <section
          aria-label="Workspace setup"
          className="flex h-full min-h-0 flex-1 items-center justify-center overflow-y-auto bg-background p-6 text-foreground shadow-md"
        >
          <div className="flex w-full max-w-md flex-col gap-6">
            {type && (
              <img src={workspaceProviderIcon[type]} alt="" className="size-10 self-center" />
            )}
            <h1 className="text-center text-xl font-medium">
              {isError
                ? 'Could not check your agent'
                : needsLogin
                  ? 'Connect your agent'
                  : 'Your agent is unavailable'}
            </h1>
            {!isError && needsLogin && canLogIn ? (
              <HarnessConnection
                type={type}
                onConnected={recheck}
                connectedContent={
                  <div role="status" className="flex flex-col items-start gap-4">
                    <p className="text-sm text-muted-foreground">
                      {isFetching
                        ? 'Checking workspace access…'
                        : `Signed in to ${workspaceTypeLabel[type]}, but this workspace still needs attention. ${reason ?? ''}`}
                    </p>
                    {retry}
                  </div>
                }
              />
            ) : (
              <div role="alert" className="flex flex-col items-center gap-4">
                <p className="text-sm wrap-anywhere whitespace-pre-wrap text-muted-foreground">
                  {isError ? 'Could not check this workspace’s agent. Try again.' : reason}
                </p>
                {!isError && needsLogin && (
                  <p className="text-sm text-muted-foreground">
                    Complete sign-in in your agent’s terminal, then try again.
                  </p>
                )}
                {retry}
              </div>
            )}
          </div>
        </section>
      )}
    </>
  )
}
