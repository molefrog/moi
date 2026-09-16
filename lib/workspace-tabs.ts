// Internal tab identifiers stay separate from public navigation addresses.
import type { WorkspaceTabId } from './types'
import { addressPath } from './navigation'

export function isWorkspaceTabId(value: unknown): value is WorkspaceTabId {
  return (
    value === 'agent' ||
    value === 'overview' ||
    value === 'scratchpad' ||
    // One path segment: a URL wildcard can span segments, a tab id never does.
    (typeof value === 'string' &&
      (/^view:[^/]+$/.test(value) || /^view-builder:[^/]+$/.test(value)))
  )
}

// The tab id carried by a URL's wildcard segment, or null when the segment is
// missing or isn't a tab id (bare `/workspace/:id`, stale or mangled links).
export function parseWorkspaceTab(segment: string | null | undefined): WorkspaceTabId | null {
  return isWorkspaceTabId(segment) ? segment : null
}

export function workspaceTabPath(workspaceId: string, tab: WorkspaceTabId): string {
  return addressPath(workspaceId, { tab, search: '' })
}

export const viewTabId = (viewId: string): WorkspaceTabId => `view:${viewId}`
export const viewIdFromTab = (tab: WorkspaceTabId): string | null =>
  tab.startsWith('view:') ? tab.slice('view:'.length) : null
export const viewBuilderTabId = (builderId: string): WorkspaceTabId => `view-builder:${builderId}`
export const viewBuilderIdFromTab = (tab: WorkspaceTabId): string | null =>
  tab.startsWith('view-builder:') ? tab.slice('view-builder:'.length) : null

// A record check shared by JSON boundary validators.
export function isParamsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
