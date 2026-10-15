import { Activity, useCallback, useState, type ReactNode } from 'react'

import { useAppConfig } from '@/client/api/app-config'
import { useWorkspaceAgent } from '../api'
import { WorkspaceLoginState } from './workspace-login-state'
import {
  HarnessUnavailableState,
  WorkspaceCheckFailedState,
  WorkspaceMissingState
} from './workspace-recovery-states'

export function useWorkspaceSetup(workspaceId: string, contentPending = false) {
  const { demo } = useAppConfig()
  const { data, isError, isPending, isFetching, isFetchedAfterMount, refetch } = useWorkspaceAgent(
    workspaceId,
    !demo
  )
  // A cached failure is only a hint until this visit's check has settled.
  const checking =
    isPending || (isFetching && !isFetchedAfterMount && data?.availability.status !== 'available')
  const recheck = useCallback(() => {
    void refetch()
  }, [refetch])

  function renderRecovery() {
    if (demo || checking) return undefined
    // Background network failures do not invalidate a known working workspace.
    if (isError && data?.availability.status === 'available') return undefined
    if (isError || !data) {
      return <WorkspaceCheckFailedState retrying={isFetching} onRetry={recheck} />
    }
    if (data.missingWorkspacePath) {
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
  return { recovery, ready: !recovery && !contentPending && (demo || !checking) }
}

type WorkspaceActivityProps = {
  ready: boolean
  children: ReactNode
}

// Defer the first mount, then preserve drafts, tabs and portals during recovery.
export function WorkspaceActivity({ ready, children }: WorkspaceActivityProps) {
  const [opened, setOpened] = useState(false)
  if (ready && !opened) setOpened(true)
  return opened ? <Activity mode={ready ? 'visible' : 'hidden'}>{children}</Activity> : null
}
