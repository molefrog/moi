import type { AppIconId } from './app-icons'
import type { WorkspaceTheme } from './themes'

export type OnboardingHarness = 'claude-code' | 'codex'
export type OnboardingAppletPlan = {
  name: string
  description: string
  features: string[]
}
export type OnboardingViewPlan = OnboardingAppletPlan & { icon: AppIconId }
export type OnboardingIdea = {
  id: string
  name: string
  icon: AppIconId
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
  ideas?: OnboardingIdea[]
  workspaceId?: string
  sessionId?: string
  error?: string
}
