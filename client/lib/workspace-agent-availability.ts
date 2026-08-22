import type { HarnessAvailability } from '@/lib/types'

export type WorkspaceAgentAvailability =
  | HarnessAvailability
  | { status: 'checking' }
  | { status: 'disconnected' }

export type WorkspaceAgentUnavailable = Exclude<
  WorkspaceAgentAvailability,
  { status: 'checking' } | { status: 'available' }
>

export function resolveWorkspaceAgentAvailability(
  availability: HarnessAvailability | undefined,
  disconnected: boolean
): WorkspaceAgentAvailability {
  if (disconnected) return { status: 'disconnected' }
  return availability ?? { status: 'checking' }
}
