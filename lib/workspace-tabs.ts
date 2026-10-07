// Tab IDs are workspace-relative paths without query strings.
import type { WorkspaceTabId } from './types'

export function isWorkspaceTabId(value: unknown): value is WorkspaceTabId {
  return (
    value === 'overview' ||
    value === 'scratchpad' ||
    // Match the applet IDs accepted by the server's module routes.
    (typeof value === 'string' && /^views\/[a-zA-Z0-9_-]+$/.test(value))
  )
}

export const viewTabId = (viewId: string): WorkspaceTabId => `views/${viewId}`
export const viewIdFromTab = (tab: WorkspaceTabId): string | null =>
  tab.startsWith('views/') ? tab.slice('views/'.length) : null

// A record check shared by JSON boundary validators.
export function isParamsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
