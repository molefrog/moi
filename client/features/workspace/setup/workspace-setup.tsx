import { useCallback } from 'react'

import { useWorkspaceAgent } from '../api'
import {
  useWorkspaceWelcome,
  WorkspaceWelcomeState,
  type WorkspaceWelcomeStateProps
} from './workspace-welcome-state'
import { WorkspaceLoginState } from './workspace-login-state'
import {
  HarnessUnavailableState,
  WorkspaceCheckFailedState,
  WorkspaceLoadingState,
  WorkspaceMissingState
} from './workspace-recovery-states'

export function useWorkspaceSetup(
  workspaceId: string,
  contentPending = false,
  welcome: WorkspaceWelcomeStateProps = {}
) {
  const { data, isError, isPending, isFetching, isFetchedAfterMount, refetch } =
    useWorkspaceAgent(workspaceId)
  // A cached failure is only a hint until this visit's check has settled.
  const checking =
    isPending || (isFetching && !isFetchedAfterMount && data?.availability.status !== 'available')
  const recheck = useCallback(() => {
    void refetch()
  }, [refetch])

  function renderRecovery() {
    if (checking) return undefined
    // Background network failures do not invalidate a known working workspace.
    if (isError && data?.availability.status === 'available') return undefined
    if (isError || !data) {
      return <WorkspaceCheckFailedState retrying={isFetching} onRetry={recheck} />
    }
    if (data.workspaceFolderMissing) {
      return <WorkspaceMissingState workspaceId={workspaceId} />
    }
    const { provider, availability } = data
    if (availability.status === 'available') return undefined
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
  const ready = !recovery && !contentPending && !checking
  const welcoming = useWorkspaceWelcome(workspaceId)
  return {
    content: welcoming ? (
      <WorkspaceWelcomeState {...welcome} />
    ) : (
      (recovery ?? <WorkspaceLoadingState />)
    ),
    ready: ready && !welcoming
  }
}
