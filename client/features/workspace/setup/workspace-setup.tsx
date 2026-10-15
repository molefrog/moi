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
  children: ReactNode
}

export function WorkspaceSetup(props: WorkspaceSetupProps) {
  const { demo } = useAppConfig()
  return demo ? props.children : <CheckedWorkspaceSetup {...props} />
}

function CheckedWorkspaceSetup({ workspaceId, children }: WorkspaceSetupProps) {
  const { data, isError, isPending, isFetching, refetch } = useWorkspaceAgent(workspaceId)
  const ready = !isError && !data?.missingWorkspacePath && data?.availability.status === 'available'
  // Mount only after the first successful check, then preserve workspace state during recovery.
  const [opened, setOpened] = useState(false)
  if (ready && !opened) setOpened(true)
  const recheck = useCallback(() => {
    void refetch()
  }, [refetch])

  function renderRecovery() {
    if (isPending) return <WorkspaceLoadingState />
    if (isError || !data) {
      return <WorkspaceCheckFailedState retrying={isFetching} onRetry={recheck} />
    }
    if (data.missingWorkspacePath) {
      return (
        <WorkspaceMissingState
          path={data.missingWorkspacePath}
          retrying={isFetching}
          onRetry={recheck}
        />
      )
    }
    const { provider, availability } = data
    if (availability.status === 'available') return null
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

  return (
    <>
      {opened && <Activity mode={ready ? 'visible' : 'hidden'}>{children}</Activity>}
      {!ready && (
        <section
          aria-label={isPending ? 'Loading workspace' : 'Workspace setup'}
          className="flex h-full min-h-0 flex-1 overflow-y-auto bg-background text-foreground shadow-md"
        >
          {renderRecovery()}
        </section>
      )}
    </>
  )
}
