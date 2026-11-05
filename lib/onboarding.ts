import type { IdentityIconId } from './identity-icons'
import type { WorkspaceTheme } from './themes'
import { z } from 'zod'

export const discoveryProgressSchema = z
  .object({
    message: z.string().trim().min(1).max(50)
  })
  .strict()
export type DiscoveryProgress = z.infer<typeof discoveryProgressSchema>

export type OnboardingHarness = 'claude-code' | 'codex'
export type OnboardingAppletPlan = {
  name: string
  description: string
  features: string[]
}
export type OnboardingViewPlan = OnboardingAppletPlan & { icon: IdentityIconId }
export type OnboardingIdea = {
  id: string
  name: string
  icon: IdentityIconId
  theme: Pick<WorkspaceTheme, 'font' | 'color'>
  description: string
  views: OnboardingViewPlan[]
  widgets: OnboardingAppletPlan[]
}
export type IdeaDiscovery = { harness: OnboardingHarness; runId: string }
export type WorkspaceBuild = {
  harness: OnboardingHarness
  operationId: string
  idea: OnboardingIdea
}
export type OnboardingJobResult = {
  status: 'running' | 'done' | 'failed'
  progress?: DiscoveryProgress
  ideas?: OnboardingIdea[]
  workspaceId?: string
  sessionId?: string
  error?: string
}
