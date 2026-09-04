import { startWorkspaceLogin, useWorkspaceAgent } from '@/client/features/workspace/api'
import { resolveAgentAvailability, type AgentAvailability } from '@/client/lib/agent-availability'

import { ErrorBanner } from './banners/ErrorBanner'
import { resolveComposerBanner, type ComposerBanner } from './banners/ComposerBanner'
import { AgentAvailabilityBanner } from './banners/AgentAvailabilityBanner'
import { SkillUpdateBanner } from './banners/SkillUpdateBanner'
import { useWorkspaceSkillUpdates } from './useWorkspaceSkillUpdates'

type WorkspaceComposerStateOptions = {
  chatError: string | null
  onDismissChatError: () => void
  chatLoadError?: string | null
  onRetryChatLoad?: () => void
}

type WorkspaceComposerState = {
  composerBanner?: ComposerBanner
  builderComposerBanner?: ComposerBanner
  agentAvailability: AgentAvailability
}

export function useWorkspaceComposerState(
  workspaceId: string,
  { chatError, onDismissChatError, chatLoadError, onRetryChatLoad }: WorkspaceComposerStateOptions
): WorkspaceComposerState {
  const { data: agent, error } = useWorkspaceAgent(workspaceId)
  const availability = agent?.availability
  const { bannerProps: skillUpdateBanner } = useWorkspaceSkillUpdates(workspaceId)
  const agentAvailability = resolveAgentAvailability(availability, Boolean(error))
  const unavailable =
    agentAvailability.status === 'checking' || agentAvailability.status === 'available'
      ? undefined
      : agentAvailability

  const agentUnavailableBanner: ComposerBanner | undefined = unavailable
    ? {
        tone: 'default',
        content: (
          <AgentAvailabilityBanner
            availability={unavailable}
            login={agent?.login}
            onStartLogin={() => startWorkspaceLogin(workspaceId)}
          />
        )
      }
    : undefined
  let chatErrorBanner: ComposerBanner | undefined
  if (chatLoadError) {
    chatErrorBanner = {
      tone: 'error',
      content: <ErrorBanner error={chatLoadError} onRetry={onRetryChatLoad} />
    }
  } else if (chatError) {
    chatErrorBanner = {
      tone: 'error',
      content: <ErrorBanner error={chatError} onDismiss={onDismissChatError} />
    }
  }
  const skillUpdate: ComposerBanner | undefined = skillUpdateBanner
    ? {
        tone: 'default',
        content: <SkillUpdateBanner {...skillUpdateBanner} />
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

  return { agentAvailability, composerBanner, builderComposerBanner }
}
