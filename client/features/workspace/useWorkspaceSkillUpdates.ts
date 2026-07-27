import { useCallback, useEffect, useState } from 'react'

import { useAppSettings, useSaveAppSettings } from '@/client/features/settings/api'
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
  // The auto-update flag is an app setting (server-side, shared across
  // clients). Until it loads, neither prompt nor auto-update — acting on the
  // default would flash the banner or skip an enabled auto-update.
  const settings = useAppSettings()
  const { mutate: saveSettings } = useSaveAppSettings()
  const settingsReady = settings.data !== undefined
  const autoUpdateEnabled = settings.data?.autoUpdateSkills ?? false
  const enableAutoUpdate = useCallback(
    () => saveSettings({ autoUpdateSkills: true }),
    [saveSettings]
  )
  const [visit, setVisit] = useState<VisitState>(() => initialVisitState(workspaceId))
  const currentVisit = visit.workspaceId === workspaceId ? visit : initialVisitState(workspaceId)

  useEffect(() => {
    setVisit(initialVisitState(workspaceId))
    resetUpdate()
  }, [workspaceId, resetUpdate])

  const onUpdate = useCallback(
    (action: WorkspaceSkillUpdateAction) => {
      if (updatePending) return
      if (action === 'auto') enableAutoUpdate()
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
      settingsReady &&
      shouldAutomaticallyUpdateWorkspaceSkills({
        updateAvailable,
        autoUpdateEnabled,
        updatePending,
        phase: currentVisit.phase
      })
    ) {
      onUpdate('auto')
    }
  }, [
    autoUpdateEnabled,
    currentVisit.phase,
    onUpdate,
    settingsReady,
    updateAvailable,
    updatePending
  ])

  const visible =
    settingsReady &&
    shouldShowWorkspaceSkillUpdateBanner({
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
