import type { WorkspaceTabId } from './types'

// Each tab gets a temporary draft id for unsent text and attachments.
// This id never goes to a harness; the first send creates a real session.
export function draftSessionId(tabId: WorkspaceTabId): string {
  return `draft:${tabId}`
}
export function composerDraftKey(workspaceId: string, sessionId: string): string {
  return JSON.stringify([workspaceId, sessionId])
}
