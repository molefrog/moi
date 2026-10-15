import { useWorkspaceAgent } from '@/client/features/workspace/api'
import { resolveAgentAvailability, type AgentAvailability } from '@/client/lib/agent-availability'

import { ErrorBanner } from './banners/ErrorBanner'
import type { ComposerBanner } from './banners/ComposerBanner'
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
  viewDraftComposerBanner?: ComposerBanner
  agentAvailability: AgentAvailability
}

export function useWorkspaceComposerState(
  workspaceId: string,
  { chatError, onDismissChatError, chatLoadError, onRetryChatLoad }: WorkspaceComposerStateOptions
): WorkspaceComposerState {
  const { data: agent, error, refetch } = useWorkspaceAgent(workspaceId)
  const availability = agent?.availability
  const { bannerProps: skillUpdateBanner } = useWorkspaceSkillUpdates(workspaceId)
  const agentAvailability = resolveAgentAvailability(availability, Boolean(error))
  // Recovery hides chat. Only checks that leave the workspace visible need a banner.
  const statusBanner: ComposerBanner | undefined = error
    ? {
        tone: 'error',
        content: (
          <ErrorBanner error="Could not check agent availability" onRetry={() => void refetch()} />
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
  const composerBanner = statusBanner ?? chatErrorBanner ?? skillUpdate
  const viewDraftComposerBanner = statusBanner ?? skillUpdate

  return { agentAvailability, composerBanner, viewDraftComposerBanner }
}
