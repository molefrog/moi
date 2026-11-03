import { useHarnessStatus } from '@/client/features/harness/api'
import { useWorkspaceHarness } from '@/client/features/workspace/api'
import { resolveAgentAvailability, type AgentAvailability } from '@/client/lib/agent-availability'

import { ErrorBanner } from './banners/error-banner'
import type { ComposerBanner } from './banners/composer-banner'
import { SkillUpdateBanner } from './banners/skill-update-banner'
import { useWorkspaceSkillUpdates } from './use-workspace-skill-updates'

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
  const workspace = useWorkspaceHarness(workspaceId)
  const harness = workspace.data
  const status = useHarnessStatus(
    harness?.hasAuthOverrides || harness?.isFolderMissing ? undefined : harness?.provider
  )
  const readiness = status.isEnabled ? status : workspace
  const error = readiness.error ?? workspace.error
  const refetch = workspace.isError ? workspace.refetch : readiness.refetch
  const availability = readiness.data?.availability
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
