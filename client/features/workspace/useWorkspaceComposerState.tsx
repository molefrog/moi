import type { ReactNode } from 'react'

import type { ComposerAvailability } from '@/client/components/shared/Composer'

import { startWorkspaceLogin, useWorkspaceAvailability } from './api'
import { WorkspaceAgentAvailabilityBanner } from './WorkspaceAgentAvailabilityBanner'
import { WorkspaceSkillUpdateBanner } from './WorkspaceSkillUpdateBanner'
import { useWorkspaceSkillUpdates } from './useWorkspaceSkillUpdates'

type WorkspaceComposerState = {
  composerBanner: ReactNode
  composerAvailability: ComposerAvailability
}

export function useWorkspaceComposerState(workspaceId: string): WorkspaceComposerState {
  const availabilityQuery = useWorkspaceAvailability(workspaceId)
  const availability = availabilityQuery.error
    ? {
        available: false as const,
        reason: `Could not check agent status: ${availabilityQuery.error.message}`
      }
    : availabilityQuery.data
  const { bannerProps: skillUpdateBanner } = useWorkspaceSkillUpdates(workspaceId)

  return {
    composerAvailability:
      availability === undefined
        ? { status: 'checking' }
        : availability.available
          ? { status: 'available' }
          : { status: 'unavailable', reason: availability.reason },
    composerBanner:
      availability?.available === false || skillUpdateBanner ? (
        <>
          {availability?.available === false && (
            <WorkspaceAgentAvailabilityBanner
              availability={availability}
              onStartLogin={() => startWorkspaceLogin(workspaceId)}
            />
          )}
          {skillUpdateBanner && <WorkspaceSkillUpdateBanner {...skillUpdateBanner} />}
        </>
      ) : undefined
  }
}
