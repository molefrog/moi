import { useHarnessStatus } from '@/client/features/harness/api'
import { useCallback } from 'react'
import { useAppConfig } from '@/client/api/app-config'

import { useWorkspaceHarness } from '../api'
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
  const { environment, demo } = useAppConfig()
  const workspace = useWorkspaceHarness(workspaceId)
  const { data } = workspace
  const status = useHarnessStatus(
    data?.hasAuthOverrides || data?.isFolderMissing ? undefined : data?.provider
  )
  const readiness = status.isEnabled ? status : workspace
  const isFetching = readiness.isFetching || workspace.isFetching
  const refetch = workspace.isError ? workspace.refetch : readiness.refetch
  const availability = readiness.data?.availability
  const isError = readiness.isError || workspace.isError
  const checking = workspace.isPending || readiness.isPending
  const recheck = useCallback(() => {
    void refetch()
  }, [refetch])

  function renderRecovery() {
    if (checking) return undefined
    // Background network failures do not invalidate a known working workspace.
    if (isError && availability?.status === 'available') return undefined
    if (isError || !data || !availability) {
      return <WorkspaceCheckFailedState retrying={isFetching} onRetry={recheck} />
    }
    if (data.isFolderMissing) {
      return <WorkspaceMissingState workspaceId={workspaceId} />
    }
    const { provider } = data
    if (availability.status === 'available') return undefined
    if (
      (availability.status === 'login-required' ||
        (environment === 'local' &&
          !demo &&
          availability.status === 'unavailable' &&
          availability.code === 'not-installed')) &&
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
    ready: ready && !welcoming,
    setupRequired: welcoming || !!recovery
  }
}
