import { remoteFromIdentity } from '@/lib/workspace-identity'

// Remote chat support is deferred. Keep the UI and non-React callers on the same rule.
export function chatAvailable(workspaceId: string): boolean {
  return !remoteFromIdentity(workspaceId)
}
