import { useEffect, useState } from 'react'

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
  permanentlyDisabled: boolean
  phase: VisitPhase
}): boolean {
  return (
    input.phase === 'active' ||
    (input.phase === 'idle' && input.updateAvailable && !input.permanentlyDisabled)
  )
}

export function useWorkspaceSkillUpdateBanner(
  workspaceId: string
): WorkspaceSkillUpdateBannerProps | null {
  const skills = useWorkspaceSkills(workspaceId)
  const update = useUpdateWorkspaceSkills(workspaceId)
  const permanentlyDisabled = useUiStore(state =>
    (state.skillUpdatePromptDisabledWorkspaceIds ?? []).includes(workspaceId)
  )
  const disablePrompt = useUiStore(state => state.disableSkillUpdatePrompt)
  const [visit, setVisit] = useState<VisitState>(() => initialVisitState(workspaceId))
  const currentVisit = visit.workspaceId === workspaceId ? visit : initialVisitState(workspaceId)
  const resetUpdate = update.reset

  useEffect(() => {
    setVisit(initialVisitState(workspaceId))
    resetUpdate()
  }, [workspaceId, resetUpdate])

  const visible = shouldShowWorkspaceSkillUpdateBanner({
    updateAvailable: skills.data?.updateAvailable ?? false,
    permanentlyDisabled,
    phase: currentVisit.phase
  })
  if (!visible) return null

  const onUpdate = (action: WorkspaceSkillUpdateAction) => {
    if (update.isPending) return
    if (action === 'never') disablePrompt(workspaceId)
    setVisit({
      workspaceId,
      phase: 'active',
      pendingAction: action,
      error: null
    })
    update.mutate(undefined, {
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
  }

  return {
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
}
