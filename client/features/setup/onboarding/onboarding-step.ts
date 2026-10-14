import type { AppEnvironment, HarnessInstallations } from '@/lib/types'

export function getOnboardingStep(
  environment: AppEnvironment,
  installed: HarnessInstallations,
  workspaceCount: number,
  hasAuthenticatedHarness: boolean
): 'agent' | 'workspace' | undefined {
  const hasAgent =
    installed['claude-code'] ||
    installed.codex ||
    (environment === 'local' && (installed.openclaw || installed.hermes))

  if (!hasAgent) return 'agent'
  if (workspaceCount === 0) return hasAuthenticatedHarness ? 'workspace' : 'agent'
  return undefined
}
