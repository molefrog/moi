import { Activity, useCallback, useState, type ReactNode } from 'react'

import { useAppConfig } from '@/client/api/app-config'
import { useWorkspaceAgent } from '../api'
import { WorkspaceLoginState } from './workspace-login-state'
import {
  HarnessUnavailableState,
  WorkspaceCheckFailedState,
  WorkspaceLoadingState,
  WorkspaceMissingState
} from './workspace-recovery-states'

type WorkspaceSetupProps = {
  workspaceId: string
  contentPending?: boolean
  children: ReactNode
}

export function WorkspaceSetup({
  workspaceId,
  contentPending = false,
  children
}: WorkspaceSetupProps) {
  const { demo } = useAppConfig()
  const { data, isError, isPending, isFetching, refetch } = useWorkspaceAgent(workspaceId, !demo)
  const [opened, setOpened] = useState(false)
  const recheck = useCallback(() => {
    void refetch()
  }, [refetch])

  function renderRecovery() {
    if (demo) return contentPending ? <WorkspaceLoadingState /> : undefined
    if (isPending) return <WorkspaceLoadingState />
    if (isError || !data) {
      return <WorkspaceCheckFailedState retrying={isFetching} onRetry={recheck} />
    }
    if (data.missingWorkspacePath) {
      return <WorkspaceMissingState workspaceId={workspaceId} />
    }
    const { provider, availability } = data
    if (availability.status === 'available') {
      return contentPending ? <WorkspaceLoadingState /> : undefined
    }
    if (
      availability.status === 'login-required' &&
      (provider === 'claude-code' || provider === 'codex')
    ) {
      return (
        <WorkspaceLoginState
          type={provider}
          reason={availability.reason}
          checking={isFetching}
          onRecheck={recheck}
        />
      )
    }
    return (
      <HarnessUnavailableState
        type={provider}
        availability={availability}
        retrying={isFetching}
        onRetry={recheck}
      />
    )
  }

  const recovery = renderRecovery()
  const ready = recovery === undefined
  // Mount once ready, then preserve workspace state during recovery.
  if (ready && !opened) setOpened(true)

  return (
    <>
      {opened && <Activity mode={ready ? 'visible' : 'hidden'}>{children}</Activity>}
      {!ready && (
        <section
          aria-label="Workspace setup"
          className="flex h-full min-h-0 flex-1 overflow-y-auto bg-background text-foreground shadow-md"
        >
          {recovery}
        </section>
      )}
    </>
  )
}
