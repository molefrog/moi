import type { ComposerAvailability } from '@/client/components/shared/Composer'
import { startWorkspaceLogin, useWorkspaceAvailability } from '@/client/features/workspace/api'

import { ChatErrorBanner } from './banners/ChatErrorBanner'
import { resolveComposerBanner, type ComposerBanner } from './banners/ComposerBanner'
import { WorkspaceAgentAvailabilityBanner } from './banners/WorkspaceAgentAvailabilityBanner'
import { WorkspaceSkillUpdateBanner } from './banners/WorkspaceSkillUpdateBanner'
import { useWorkspaceSkillUpdates } from './useWorkspaceSkillUpdates'

type WorkspaceComposerStateOptions = {
  chatError: string | null
  onDismissChatError: () => void
}

type WorkspaceComposerState = {
  composerBanner?: ComposerBanner
  composerAvailability: ComposerAvailability
}

export function useWorkspaceComposerState(
  workspaceId: string,
  { chatError, onDismissChatError }: WorkspaceComposerStateOptions
): WorkspaceComposerState {
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
    composerAvailability = { status: 'unavailable' }
  } else if (availability) {
    composerAvailability = { status: 'available' }
  }

  const agentUnavailableBanner: ComposerBanner | undefined = unavailable
    ? {
        tone: 'muted',
        content: (
          <WorkspaceAgentAvailabilityBanner
            availability={unavailable}
            onStartLogin={() => startWorkspaceLogin(workspaceId)}
          />
        )
      }
    : undefined
  const chatErrorBanner: ComposerBanner | undefined = chatError
    ? {
        tone: 'destructive',
        content: <ChatErrorBanner error={chatError} onDismiss={onDismissChatError} />
      }
    : undefined
  const skillUpdate: ComposerBanner | undefined = skillUpdateBanner
    ? {
        tone: 'muted',
        content: <WorkspaceSkillUpdateBanner {...skillUpdateBanner} />
      }
    : undefined
  const composerBanner = resolveComposerBanner({
    agentUnavailable: agentUnavailableBanner,
    chatError: chatErrorBanner,
    skillUpdate
  })

  return { composerAvailability, composerBanner }
}
