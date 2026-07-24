import { useCallback, useEffect, useState } from 'react'

import { useUiStore } from '@/client/store/ui'
import { useUpdateWorkspaceSkills, useWorkspaceSkills } from '@/client/features/workspace/api'

import type {
  WorkspaceSkillUpdateAction,
  WorkspaceSkillUpdateBannerProps
} from './WorkspaceSkillUpdateBanner'

type VisitPhase = 'idle' | 'active' | 'dismissed'

type VisitState = {
  workspaceId: string
  phase: VisitPhase
  pendingAction: WorkspaceSkillUpdateAction | null
  error: string | null
}

export type WorkspaceSkillUpdates = {
  bannerProps: WorkspaceSkillUpdateBannerProps | null
}

function initialVisitState(workspaceId: string): VisitState {
  return {
    workspaceId,
    phase: 'idle',
    pendingAction: null,
    error: null
  }
}

export function shouldShowWorkspaceSkillUpdateBanner(input: {
  updateAvailable: boolean
  autoUpdateEnabled: boolean
  phase: VisitPhase
}): boolean {
  return (
    input.phase === 'active' ||
    (input.phase === 'idle' && input.updateAvailable && !input.autoUpdateEnabled)
  )
}

export function shouldAutomaticallyUpdateWorkspaceSkills(input: {
  updateAvailable: boolean
  autoUpdateEnabled: boolean
  updatePending: boolean
  phase: VisitPhase
}): boolean {
  return (
    input.updateAvailable &&
    input.autoUpdateEnabled &&
    !input.updatePending &&
    input.phase === 'idle'
  )
}

export function useWorkspaceSkillUpdates(workspaceId: string): WorkspaceSkillUpdates {
  const skills = useWorkspaceSkills(workspaceId)
  const {
    isPending: updatePending,
    mutate: updateSkills,
    reset: resetUpdate
  } = useUpdateWorkspaceSkills(workspaceId)
  const autoUpdateEnabled = useUiStore(state =>
    (state.skillAutoUpdateWorkspaceIds ?? []).includes(workspaceId)
  )
  const enableAutoUpdate = useUiStore(state => state.enableSkillAutoUpdate)
  const [visit, setVisit] = useState<VisitState>(() => initialVisitState(workspaceId))
  const currentVisit = visit.workspaceId === workspaceId ? visit : initialVisitState(workspaceId)

  useEffect(() => {
    setVisit(initialVisitState(workspaceId))
    resetUpdate()
  }, [workspaceId, resetUpdate])

  const onUpdate = useCallback(
    (action: WorkspaceSkillUpdateAction) => {
      if (updatePending) return
      if (action === 'auto') enableAutoUpdate(workspaceId)
      setVisit({
        workspaceId,
        phase: 'active',
        pendingAction: action,
        error: null
      })
      updateSkills(undefined, {
        onSuccess: () => {
          setVisit(state =>
            state.workspaceId === workspaceId
              ? { ...state, phase: 'dismissed', pendingAction: null, error: null }
              : state
          )
        },
        onError: error => {
          setVisit(state =>
            state.workspaceId === workspaceId && state.phase !== 'dismissed'
              ? { ...state, phase: 'active', pendingAction: null, error: error.message }
              : state
          )
        }
      })
    },
    [enableAutoUpdate, updatePending, updateSkills, workspaceId]
  )

  const updateAvailable = skills.data?.updateAvailable ?? false

  useEffect(() => {
    if (
      shouldAutomaticallyUpdateWorkspaceSkills({
        updateAvailable,
        autoUpdateEnabled,
        updatePending,
        phase: currentVisit.phase
      })
    ) {
      onUpdate('auto')
    }
  }, [autoUpdateEnabled, currentVisit.phase, onUpdate, updateAvailable, updatePending])

  const visible = shouldShowWorkspaceSkillUpdateBanner({
    updateAvailable,
    autoUpdateEnabled,
    phase: currentVisit.phase
  })
  return {
    bannerProps: visible
      ? {
          error: currentVisit.error,
          pendingAction: currentVisit.pendingAction,
          onUpdate,
          onDismiss: () => {
            setVisit(state =>
              state.workspaceId === workspaceId
                ? { ...state, phase: 'dismissed', pendingAction: null, error: null }
                : state
            )
          }
        }
      : null
  }
}
