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

export function tabFromPath(path: string): WorkspaceTabId | undefined {
  try {
    const tab = decodeURIComponent(path)
    return isWorkspaceTabId(tab) ? tab : undefined
  } catch {
    return undefined
  }
}

export const viewTabId = (viewId: string): WorkspaceTabId => `views/${viewId}`
export const viewIdFromTab = (tab: WorkspaceTabId): string | undefined =>
  tab.startsWith('views/') ? tab.slice('views/'.length) : undefined

// A record check shared by JSON boundary validators.
export function isParamsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
