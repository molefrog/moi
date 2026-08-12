import type { ComposerAvailability } from '@/client/components/shared/Composer'
import { startWorkspaceLogin, useWorkspaceAgent } from '@/client/features/workspace/api'

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
  builderComposerBanner?: ComposerBanner
  composerAvailability: ComposerAvailability
}

export function useWorkspaceComposerState(
  workspaceId: string,
  { chatError, onDismissChatError }: WorkspaceComposerStateOptions
): WorkspaceComposerState {
  const { data: agent, error } = useWorkspaceAgent(workspaceId)
  const availability = agent?.availability
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
        tone: 'default',
        content: (
          <WorkspaceAgentAvailabilityBanner
            availability={unavailable}
            login={agent?.login}
            onStartLogin={() => startWorkspaceLogin(workspaceId)}
          />
        )
      }
    : undefined
  const chatErrorBanner: ComposerBanner | undefined = chatError
    ? {
        tone: 'error',
        content: <ChatErrorBanner error={chatError} onDismiss={onDismissChatError} />
      }
    : undefined
  const skillUpdate: ComposerBanner | undefined = skillUpdateBanner
    ? {
        tone: 'default',
        content: <WorkspaceSkillUpdateBanner {...skillUpdateBanner} />
      }
    : undefined
  const composerBanner = resolveComposerBanner({
    agentUnavailable: agentUnavailableBanner,
    chatError: chatErrorBanner,
    skillUpdate
  })
  const builderComposerBanner = resolveComposerBanner({
    agentUnavailable: agentUnavailableBanner,
    skillUpdate
  })

  return { composerAvailability, composerBanner, builderComposerBanner }
}
