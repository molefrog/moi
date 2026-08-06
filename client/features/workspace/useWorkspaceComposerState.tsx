import type { ReactNode } from 'react'

import type { ComposerAvailability } from '@/client/components/shared/Composer'

import { startWorkspaceLogin, useWorkspaceAvailability } from './api'
import { WorkspaceAgentAvailabilityBanner } from './WorkspaceAgentAvailabilityBanner'
import { WorkspaceSkillUpdateBanner } from './WorkspaceSkillUpdateBanner'
import { useWorkspaceSkillUpdates } from './useWorkspaceSkillUpdates'

type WorkspaceComposerState = {
  composerBanner?: ReactNode
  composerAvailability: ComposerAvailability
}

export function useWorkspaceComposerState(workspaceId: string): WorkspaceComposerState {
  const { data: availability, error } = useWorkspaceAvailability(workspaceId)
  const { bannerProps: skillUpdateBanner } = useWorkspaceSkillUpdates(workspaceId)

  let unavailable = availability?.available === false ? availability : undefined
  if (error) {
    unavailable = {
      available: false,
      reason: `Could not check agent status: ${error.message}`
    }
  }

  let composerAvailability: ComposerAvailability = { status: 'checking' }
  if (unavailable) {
    composerAvailability = { status: 'unavailable', reason: unavailable.reason }
  } else if (availability) {
    composerAvailability = { status: 'available' }
  }

  let composerBanner: ReactNode
  if (unavailable) {
    composerBanner = (
      <WorkspaceAgentAvailabilityBanner
        availability={unavailable}
        onStartLogin={() => startWorkspaceLogin(workspaceId)}
      />
    )
  } else if (skillUpdateBanner) {
    composerBanner = <WorkspaceSkillUpdateBanner {...skillUpdateBanner} />
  }

  return { composerAvailability, composerBanner }
}
